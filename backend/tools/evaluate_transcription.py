"""Replay explicitly supplied WAV fixtures through the live transcription bridge.

Calls the configured API; never connects to the application database. Manifest:
[{"id":"room-01","audio":"room-01.wav","reference":"Human-checked text",
  "language":null,"kind":"recorded"}]
Audio must be mono, 24 kHz, 16-bit PCM. Relative paths resolve beside the manifest.
Run: python -m backend.tools.evaluate_transcription manifest.json --output results.json
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import time
import unicodedata
import wave
from pathlib import Path

from backend.app.realtime_transcription import RealtimeTranscriptionSession


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).lower()
                   if unicodedata.category(c)[0] in 'LMN')


def character_error_rate(reference, transcript):
    reference, transcript = normalized(reference), normalized(transcript)
    if not reference:
        return None  # Silence is evaluated as unexpected text, not a rate.
    row = list(range(len(transcript) + 1))
    for index, expected in enumerate(reference, 1):
        new = [index]
        for column, actual in enumerate(transcript, 1):
            new.append(min(new[-1] + 1, row[column] + 1,
                           row[column - 1] + (expected != actual)))
        row = new
    return row[-1] / len(reference)


async def evaluate(sample, directory):
    if sample.get('kind') not in ('recorded', 'synthetic'):
        raise ValueError('Each sample must identify kind as recorded or synthetic')
    audio_path = directory / sample['audio']
    with wave.open(str(audio_path), 'rb') as audio:
        if (audio.getnchannels(), audio.getframerate(), audio.getsampwidth(), audio.getcomptype()) != (1, 24000, 2, 'NONE'):
            raise ValueError('Fixture must be mono, 24 kHz, uncompressed 16-bit PCM')
        pcm = audio.readframes(audio.getnframes())
    items, errors = [], []
    first_delta = None
    started = None

    async def on_delta(sid, speaker, item_id, delta):
        nonlocal first_delta
        if first_delta is None and started is not None:
            first_delta = time.monotonic() - started

    async def on_final(sid, speaker, item_id, text):
        items.append({'id': item_id, 'text': text, 'seconds_from_audio_start': time.monotonic() - started})

    async def on_error(sid, message, code):
        errors.append({'message': message, 'code': code})

    bridge = RealtimeTranscriptionSession('evaluation', 'evaluation', 'Test recording',
                                         sample.get('language'), on_delta, on_final, on_error)
    if not await bridge.start():
        raise RuntimeError('Transcription service could not start: ' + json.dumps(errors))
    started = time.monotonic()
    try:
        # Feed at the recording's original speed, rather than uploading instantly.
        for offset in range(0, len(pcm), 4800):
            chunk = pcm[offset:offset + 4800]
            await bridge.send_audio(base64.b64encode(chunk).decode('ascii'))
            target = started + (offset + len(chunk)) / 48000
            await asyncio.sleep(max(0, target - time.monotonic()))
    finally:
        stopped = time.monotonic()
        await bridge.close()
    transcript = ' '.join(item['text'] for item in items if item['text'])
    reference = sample['reference']
    return {
        'id': sample['id'], 'kind': sample['kind'], 'reference': reference,
        'transcript': transcript, 'items': items, 'errors': errors,
        'model': bridge.transcription_model, 'language_hint': bridge.language,
        'prompt': bridge.prompt, 'audio_seconds': len(pcm) / 48000,
        'first_delta_ms_from_audio_start': round(first_delta * 1000, 1) if first_delta is not None else None,
        'stop_to_finalized_ms': round((time.monotonic() - stopped) * 1000, 1),
        'character_error_rate': character_error_rate(reference, transcript),
        'unexpected_text_on_silence': not normalized(reference) and bool(normalized(transcript)),
    }


async def run(args):
    manifest = Path(args.manifest).resolve()
    samples = json.loads(manifest.read_text())
    results = []
    for sample in samples:
        results.append(await evaluate(sample, manifest.parent))
        # Preserve completed evaluations even if a later request fails.
        Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({k: results[-1][k] for k in ('id', 'kind', 'character_error_rate', 'stop_to_finalized_ms', 'errors')}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--output', required=True)
    asyncio.run(run(parser.parse_args()))
