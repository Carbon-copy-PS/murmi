import asyncio
import json
from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from backend.app.argument_queue import ArgumentQueue
from backend.app.analysis import AnalysisService
from backend.app.session import SessionManager
from backend.app import main


class ArgumentQueueTests(unittest.IsolatedAsyncioTestCase):
    async def test_fragments_wait_for_one_window(self):
        calls = []
        ready = asyncio.Event()
        async def process(sid, entries):
            calls.append(entries)
            ready.set()
            return True
        queue = ArgumentQueue(process, idle_seconds=.01, minimum_seconds=.04, maximum_seconds=.08)
        entry = {"id": "a", "text": "The last bus leaves at six."}
        try:
            queue.schedule('S', entry)
            await asyncio.sleep(.015)
            self.assertEqual(calls, [])
            entry['text'] += ' I work until eight, so we need a later bus.'
            queue.schedule('S', entry)
            await asyncio.wait_for(ready.wait(), 1)
            self.assertEqual(len(calls), 1)
            self.assertIn('later bus', calls[0][0]['text'])
        finally:
            await queue.close()

    async def test_continuing_speech_does_not_cancel_request_or_lose_new_text(self):
        started, release, finished = asyncio.Event(), asyncio.Event(), asyncio.Event()
        calls = []
        async def process(sid, entries):
            calls.append(entries)
            if len(calls) == 1:
                started.set()
                await release.wait()
            else:
                finished.set()
            return True
        queue = ArgumentQueue(process, idle_seconds=0, minimum_seconds=0, maximum_seconds=.05)
        entry = {"id": "a", "text": "First argument."}
        try:
            queue.schedule('S', entry)
            await asyncio.wait_for(started.wait(), 1)
            entry['text'] += ' With an important condition.'
            queue.schedule('S', entry)
            await asyncio.sleep(.01)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0]['text'], 'First argument.')
            release.set()
            await asyncio.wait_for(finished.wait(), 1)
            self.assertIn('important condition', calls[1][0]['text'])
        finally:
            await queue.close()

    async def test_continuous_updates_eventually_flush(self):
        ready = asyncio.Event()
        async def process(sid, entries):
            ready.set()
            return True
        queue = ArgumentQueue(process, idle_seconds=1, minimum_seconds=0, maximum_seconds=.03)
        try:
            queue.schedule('S', {'id':'a','text':'An argument'})
            await asyncio.wait_for(ready.wait(), .5)
        finally:
            await queue.close()

    async def test_stop_flushes_without_waiting_and_failures_are_bounded(self):
        process = AsyncMock(return_value=False)
        queue = ArgumentQueue(process, idle_seconds=60, minimum_seconds=60, maximum_seconds=60, retry_seconds=.001)
        try:
            queue.schedule('S', {'id':'a','text':'Keep this for retry'})
            queue.flush('S')
            await asyncio.wait_for(queue.windows['S'].task, 1)
            self.assertEqual(process.await_count, 2)
            self.assertIn('a', queue.windows['S'].pending)
            process.return_value = True
            queue.flush('S')
            await asyncio.wait_for(queue.windows['S'].task, 1)
            self.assertEqual(process.await_count, 3)
            self.assertNotIn('S', queue.windows)
        finally:
            await queue.close()


class ArgumentSelectionTests(unittest.IsolatedAsyncioTestCase):
    def service(self, arguments, finish='stop'):
        service = AnalysisService()
        service._mock = False
        captures = []
        def create(**kwargs):
            captures.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(finish_reason=finish,
                message=SimpleNamespace(content=json.dumps(arguments),refusal=None))])
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        client.with_options = lambda **kwargs: client
        service._client = client
        return service, captures

    async def test_context_and_new_text_are_distinct_and_invalid_sources_are_rejected(self):
        service, calls = self.service({'arguments':[
            {'text':'unsupported','sourceIds':['unknown']},
            {'text':'Existing view','sourceIds':['a']},
            {'text':'A new condition','sourceIds':['b','a','b']},
            {'text':'A separate objection','sourceIds':['b']},
            {'text':'Extra card','sourceIds':['a']}]})
        contributions = [{'id':'a','text':'Full argument','newText':'argument'}, {'id':'b','text':'A condition','newText':'A condition'}]
        result = await service.extract_arguments(contributions,[{'text':'What about buses?'}],['Existing view'],topic='Transport',language='en')
        self.assertEqual(len(result),2)
        self.assertEqual(result[0]['sourceIds'],['a','b'])
        evidence=json.loads(calls[0]['messages'][1]['content'])
        self.assertEqual(evidence['contributions'],contributions)
        self.assertEqual(evidence['recentContext'],[{'text':'What about buses?'}])
        self.assertEqual(evidence['existingCards'],['Existing view'])

    async def test_empty_selection_is_success_but_truncated_response_can_retry(self):
        service,_=self.service({'arguments':[]})
        self.assertEqual(await service.extract_arguments([{'id':'a'}],[],[]),[])
        service,_=self.service({'arguments':[]},finish='length')
        self.assertIsNone(await service.extract_arguments([{'id':'a'}],[],[]))


class ArgumentIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_context_source_attribution_and_speech_during_extraction(self):
        manager = SessionManager()
        session = manager._new_session('TESTARGS')
        manager.sessions[session.id] = session
        context={'id':'context','speaker':'Host','text':'Should we add more buses?','analyzedText':'Should we add more buses?'}
        entry={'id':'a','speaker':'Mei','text':'Only if shift workers can use them.','analyzedText':''}
        session.transcript=[context,entry]
        before=deepcopy(session.transcript)
        async def extract(*args, **kwargs):
            entry['text'] += ' Fares must also stay affordable.'
            return [{'text':'Bus services should cover shift workers.','sourceIds':['a']}]
        mock=AsyncMock(side_effect=extract)
        with patch.object(main,'sessions',manager), patch.object(main.analysis,'extract_arguments',mock), patch.object(main,'persist_transcript_entry',AsyncMock()), patch.object(main.db,'save_statements',AsyncMock()):
            self.assertTrue(await main.process_argument_window(session.id,[dict(entry)]))
        self.assertEqual(entry['analyzedText'],before[1]['text'])
        self.assertEqual(main.pending_turn_text(entry),'Fares must also stay affordable.')
        self.assertEqual(session.statements[0].source_text,before[1]['text'])
        self.assertEqual(session.statements[0].source_speaker,'Mei')
        self.assertEqual(mock.await_args.args[1],[{'speaker':'Host','text':context['text']}])
        self.assertEqual(session.transcript[0],before[0])

    async def test_no_argument_keeps_transcript_and_does_not_create_a_card(self):
        manager = SessionManager(); session = manager._new_session('EMPTYARGS');manager.sessions[session.id]=session
        entry={'id':'a','speaker':'Mei','text':'Let us move to the next slide.','analyzedText':''};session.transcript=[entry]
        with patch.object(main,'sessions',manager),patch.object(main.analysis,'extract_arguments',AsyncMock(return_value=[])),patch.object(main,'persist_transcript_entry',AsyncMock()):
            self.assertTrue(await main.process_argument_window(session.id,[dict(entry)]))
        self.assertEqual(entry['text'],'Let us move to the next slide.')
        self.assertEqual(entry['analyzedText'],entry['text'])
        self.assertEqual(session.statements,[])

    async def test_failed_selection_keeps_text_unprocessed(self):
        manager = SessionManager(); session = manager._new_session('FAILARGS');manager.sessions[session.id]=session
        entry={'id':'a','speaker':'Mei','text':'A meaningful proposal','analyzedText':''};session.transcript=[entry]
        with patch.object(main,'sessions',manager),patch.object(main.analysis,'extract_arguments',AsyncMock(return_value=None)):
            self.assertFalse(await main.process_argument_window(session.id,[dict(entry)]))
        self.assertEqual(entry['analyzedText'],'')
        self.assertEqual(session.statements,[])
