"""Reader-facing presentation of saved reports; never rewrite recorded words."""
import json
from pathlib import Path
import re

READING_COPY = json.loads((Path(__file__).resolve().parents[2] / 'shared/report-reading-copy.json').read_text())


def reading_copy(language):
    return READING_COPY.get((language or 'en').lower().split('-')[0], READING_COPY['en'])


def transcript_paragraphs(entries):
    """Join recording chunks, reflow at sentence ends, and preserve audio gaps."""
    paragraphs, pending = [], []

    def flush():
        text = ' '.join(pending).strip()
        start = 0
        for match in re.finditer(r'[.!?][\"\u201d\u2019)]*(?:\s+|$)|[。！？]', text):
            end = match.end()
            if end-start >= 650:
                paragraphs.append({'text':text[start:end].strip(), 'missing':False})
                start = end
        if text[start:].strip():
            paragraphs.append({'text':text[start:].strip(), 'missing':False})
        pending.clear()

    for entry in entries or []:
        if entry.get('transcriptionStatus') == 'missing':
            flush()
            paragraphs.append({'text':'', 'missing':True})
        elif (entry.get('text') or '').strip():
            pending.append(entry['text'].strip())
    flush()
    return paragraphs
