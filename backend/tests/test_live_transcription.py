import asyncio
import base64
import json
import unittest
from unittest.mock import AsyncMock, patch

from backend.app import main
from backend.app.realtime_transcription import RealtimeTranscriptionSession
from backend.app.session import SessionManager


class EventSocket:
    def __init__(self, events):
        self.events = events
        self.sent = []

    def __aiter__(self):
        return self.events_iter()

    async def events_iter(self):
        for event in self.events:
            yield json.dumps(event)

    async def send(self, value):
        self.sent.append(json.loads(value))

    async def close(self):
        pass


def committed(item):
    return {"type": "input_audio_buffer.committed", "item_id": item}


def completed(item, text):
    return {"type": "conversation.item.input_audio_transcription.completed", "item_id": item, "transcript": text}


def bridge(callback=None, events=()):
    with patch.dict('os.environ', {}, clear=True):
        result = RealtimeTranscriptionSession('TEST', 'p', 'Recorder', 'zh', AsyncMock(), callback or AsyncMock(), AsyncMock())
    result.ws = EventSocket(events)
    return result


class RealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_completions_are_published_in_commit_order_without_duplicates(self):
        item = bridge(events=[committed('a'), committed('b'), completed('b', '第二句'), completed('a', '第一句'), completed('a', '第一句')])
        await item._receive_events()
        self.assertEqual([call.args[2:] for call in item.on_final.await_args_list], [('a', '第一句'), ('b', '第二句')])

    async def test_incoming_audio_during_callback_does_not_drop_next_completion(self):
        saved = []
        async def on_final(sid, speaker, item_id, text):
            if item_id == 'a':
                await item.send_audio(base64.b64encode(b'\x00\x10' * 24000).decode())
                await asyncio.sleep(0)
            saved.append(text)
        item = bridge(on_final, [committed('a'), committed('b'), completed('a', '第一句'), completed('b', '第二句')])
        await item._receive_events()
        self.assertEqual(saved, ['第一句', '第二句'])
        self.assertEqual(item.bytes_since_commit, 48000)

    async def test_empty_and_failed_items_do_not_block_later_results(self):
        item = bridge(events=[committed('a'), committed('b'), completed('b', '第二句'), completed('a', '')])
        await item._receive_events()
        self.assertEqual([c.args[2] for c in item.on_final.await_args_list], ['a', 'b'])
        item = bridge(events=[committed('a'), committed('b'), completed('b', '第二句'), {'type': 'conversation.item.input_audio_transcription.failed', 'item_id': 'a', 'error': {'message': 'Failed'}}])
        await item._receive_events()
        self.assertEqual([c.args[2] for c in item.on_final.await_args_list], ['a', 'b'])

    async def test_vad_does_not_force_a_manual_commit_every_ten_seconds(self):
        item = bridge()
        await item.send_audio(base64.b64encode(b'\x00\x10' * 24_000 * 11).decode())
        self.assertEqual([e['type'] for e in item.ws.sent], ['input_audio_buffer.append'])
        item.turn_detection = 'manual'
        await item.send_audio(base64.b64encode(b'\x00\x10' * 24000).decode())
        self.assertEqual(item.ws.sent[-1]['type'], 'input_audio_buffer.commit')

    async def test_selected_language_reaches_request(self):
        config = bridge()._session_update()['session']['audio']['input']['transcription']
        self.assertEqual(config['language'], 'zh')
        self.assertIn('Do not translate', config['prompt'])
        self.assertNotIn('台灣', config['prompt'])
        self.assertNotIn('German', config['prompt'])
        self.assertEqual(config['model'], 'gpt-4o-transcribe')

    async def test_stop_waits_for_pending_transcription(self):
        item = bridge()
        item.pending_items.append('a')
        item.items_drained.clear()
        async def delayed_completion():
            await asyncio.sleep(0.02)
            item.completed_items['a'] = '最後一句'
            await item._publish_completed_items()
        item.receiver_task = asyncio.create_task(delayed_completion())
        await item.close()
        item.on_final.assert_awaited_once_with('TEST', 'Recorder', 'a', '最後一句')

    async def test_auto_has_no_hidden_language_override(self):
        with patch.dict('os.environ', {'OPENAI_REALTIME_LANGUAGE': 'de'}):
            item = RealtimeTranscriptionSession('TEST', 'p', 'R', None, AsyncMock(), AsyncMock(), AsyncMock())
        config = item._session_update()['session']['audio']['input']['transcription']
        self.assertNotIn('language', config)
        self.assertEqual(config['prompt'], bridge().prompt)


class QueueSocket:
    """Controllable fake API transport; no model or network calls."""
    def __init__(self):
        self.events = asyncio.Queue()
        self.sent = asyncio.Queue()

    def __aiter__(self):
        return self

    async def __anext__(self):
        return json.dumps(await self.events.get())

    async def send(self, value):
        await self.sent.put(json.loads(value))

    async def close(self):
        pass


class FinalizationTests(unittest.IsolatedAsyncioTestCase):
    def running_bridge(self):
        item = bridge()
        item.ws = QueueSocket()
        item.audio_sent = True
        item.bytes_since_commit = 48000
        item.receiver_task = asyncio.create_task(item._receive_events())
        return item, item.ws

    async def begin_stop(self, item, socket):
        task = asyncio.create_task(item.close())
        update = await asyncio.wait_for(socket.sent.get(), 1)
        self.assertIsNone(update['session']['audio']['input']['turn_detection'])
        self.assertFalse(task.done())
        await socket.events.put({'type': 'session.updated'})
        commit = await asyncio.wait_for(socket.sent.get(), 1)
        self.assertEqual(commit['type'], 'input_audio_buffer.commit')
        return task, commit

    async def test_delayed_commit_acknowledgement_does_not_drop_final_words(self):
        item, socket = self.running_bridge()
        task, commit = await self.begin_stop(item, socket)
        await asyncio.sleep(0.85)  # Longer than the former fixed 0.8-second wait.
        self.assertFalse(task.done())
        await socket.events.put(committed('last'))
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        await socket.events.put(completed('last', 'but only with parental consent'))
        await asyncio.wait_for(task, 1)
        item.on_final.assert_awaited_once_with('TEST', 'Recorder', 'last', 'but only with parental consent')
        item.on_error.assert_not_awaited()

    async def test_empty_final_buffer_still_waits_for_prior_item(self):
        item, socket = self.running_bridge()
        await socket.events.put(committed('previous'))
        task, commit = await self.begin_stop(item, socket)
        await socket.events.put({'type': 'error', 'error': {'code': 'input_audio_buffer_commit_empty', 'event_id': commit['event_id']}})
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        await socket.events.put(completed('previous', 'no'))
        await asyncio.wait_for(task, 1)
        item.on_final.assert_awaited_once_with('TEST', 'Recorder', 'previous', 'no')
        item.on_error.assert_not_awaited()

    async def test_timeout_is_reported_instead_of_silent_success(self):
        item, socket = self.running_bridge()
        item.close_timeout = 0.03
        await item.close()
        self.assertEqual(item.on_error.await_args.args[2], 'transcriptIncomplete')

    async def test_start_waits_for_configuration_acknowledgement(self):
        item = bridge()
        item.api_key = 'unit-test-key'
        socket = QueueSocket()
        with patch('backend.app.realtime_transcription.websockets.connect', AsyncMock(return_value=socket)):
            task = asyncio.create_task(item.start())
            await asyncio.wait_for(socket.sent.get(), 1)
            self.assertFalse(task.done())
            await socket.events.put({'type': 'session.updated'})
            self.assertTrue(await asyncio.wait_for(task, 1))
        await item.close(flush=False)


class CaptionPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_preserves_realtime_text_and_individual_items_when_merged(self):
        manager = SessionManager()
        session = manager._new_session('TEST')
        manager.sessions['TEST'] = session
        save = AsyncMock()
        with patch.object(main, 'sessions', manager), patch.object(main.db, 'save_transcript_entry', save), patch.object(main, 'schedule_turn_analysis'), patch.object(main.transcription, 'transcribe_pcm16', AsyncMock(return_value='Ja, genau.')) as second_pass:
            await main.finalize_caption('TEST', 'Recorder', 'a', '我們討論人工智慧。', language='zh')
            await main.finalize_caption('TEST', 'Recorder', 'b', '這是第二句。', language='zh')
        second_pass.assert_not_awaited()
        self.assertEqual(len(session.transcript), 1)
        entry = session.transcript[0]
        self.assertEqual(entry['text'], '我們討論人工智慧。 這是第二句。')
        self.assertEqual([x['text'] for x in entry['transcriptionItems']], ['我們討論人工智慧。', '這是第二句。'])
        self.assertEqual(entry['transcriptionItems'][0]['source'], 'realtime')
        self.assertEqual(entry['transcriptionItems'][0]['language'], 'zh')
        self.assertEqual(save.await_count, 2)

    async def test_long_paragraph_stops_merging(self):
        self.assertFalse(main.should_merge_transcript({'speaker': 'R', 'timestamp': 0, 'updatedAt': 39}, 'R', 40))
        self.assertTrue(main.should_merge_transcript({'speaker': 'R', 'timestamp': 20, 'updatedAt': 39}, 'R', 40))


class RawTranscriptTests(unittest.IsolatedAsyncioTestCase):
    async def test_short_responses_survive_and_analysis_filter_stays_separate(self):
        manager = SessionManager()
        session = manager._new_session('RAWTEST')
        manager.sessions[session.id] = session
        phrases = ['不要', '同意', '反對', 'yes', 'no', '嗯', 'thank you for watching']
        with patch.object(main, 'sessions', manager), patch.object(main.db, 'save_transcript_entry', AsyncMock()), patch.object(main, 'schedule_turn_analysis'):
            for index, phrase in enumerate(phrases):
                await main.finalize_caption(session.id, 'Recorder', str(index), phrase, model='test-model')
        items = [item for entry in session.transcript for item in entry['transcriptionItems']]
        self.assertEqual([item['text'] for item in items], phrases)
        self.assertTrue(all(item['model'] == 'test-model' and item['receivedAt'] for item in items))
        self.assertEqual(main.pending_turn_text({'text': 'no'}), '')

    async def test_save_failure_is_visible_and_text_remains_in_memory(self):
        manager = SessionManager()
        session = manager._new_session('RAWTEST')
        manager.sessions[session.id] = session
        error = AsyncMock()
        with patch.object(main, 'sessions', manager), patch.object(main.db, 'save_transcript_entry', AsyncMock(side_effect=RuntimeError('test failure'))), patch.object(main, 'schedule_turn_analysis'), patch.object(main, 'broadcast_caption_error', error):
            await main.finalize_caption(session.id, 'Recorder', 'a', 'no')
        self.assertEqual(session.transcript[0]['text'], 'no')
        self.assertEqual(error.await_args.args[2], 'transcriptSaveFailed')
