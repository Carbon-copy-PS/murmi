# Transcription evaluation

Keep transcription quality separate from argument extraction. A useful transcript
retains short replies, negations, conditions, and code-switching even when a turn
is not suitable for an argument card.

`evaluate_transcription.py` replays audio at its original speed through the same
Realtime bridge as the application. It uses the configured OpenAI API and model,
without joining a Murmi session or connecting to its database.

Provide mono, 24 kHz, uncompressed 16-bit WAV files and a JSON manifest:

```json
[
  {
    "id": "discussion-01",
    "kind": "recorded",
    "audio": "discussion-01.wav",
    "reference": "A human-checked transcript of this recording.",
    "language": null
  }
]
```

Use `kind: "synthetic"` for generated speech or silence. `language: null` supplies
no language hint. An explicit supported language code is passed as a hint; the
prompt stays the same. The evaluator deliberately does not load the application's
`.env`. Set `OPENAI_API_KEY` in the execution environment, then run from the root:

```sh
backend/.venv/bin/python -m backend.tools.evaluate_transcription \
  /path/to/fixtures/manifest.json --output /path/to/private/results.json
```

The command sends fixture audio to the configured transcription service. Keep
recordings, reference transcripts, and output files outside version control.

Results include the exact prompt, model, language hint, returned text, errors,
individual completed items, character error rate, time to first delta from the
start of audio playback, and time from Stop to completed finalization. Time to
first delta is not word-by-word latency. Finalization time includes connection
closure. Empty references are checked for unexpected text rather than assigned
an accuracy score.

Character error rate ignores punctuation and whitespace, but counts Traditional
versus Simplified Chinese differences. Do not interpret a script mismatch as the
same thing as omitted or invented speech. Inspect errors and record script
preferences explicitly. A failed/incomplete run is not a passing accuracy test,
even if its surviving text matches the reference.

Compare configurations on the same human-checked recordings. Include short
responses, unfinished sentences, negation, names, numbers, language switches,
room noise, and microphone distance. Record both accuracy and latency; do not
claim a production improvement from synthetic speech or a single clean clip.

Automated unit tests use mocked responses to verify preservation, ordering,
acknowledgements, and timeout behavior. They do not measure speech recognition
accuracy. The existing `gpt-4o-transcribe` model remains the baseline until a
comparison supports changing it.

## Transcript recovery checks

The live pipeline keeps short replies, uses the neutral prompt, and waits for the
final commit and transcription when recording stops. Missing committed items are
marked after 30 seconds; later completed items can then be published. A late
completion replaces its gap in the original position. Stopping or disconnecting
also preserves completed results behind missing items.

Database upserts run outside caption delivery, with a five-second attempt timeout
and exponential retries capped at 30 seconds. Updates to an entry are serialized
and coalesced to its latest snapshot. The existing row ID makes retries safe even
when a commit succeeded but its acknowledgement was lost. A warning remains until
failed entries in that session have been saved.

The retry queue is **in memory**, not a durable outbox. A server crash during a
database outage can still lose unsaved text. Audio sent during a broken connection
is not replayed or reconstructed. Gap markers describe missing text, not guessed
speech. These changes do not measure or guarantee better acoustic recognition.

Run the control-flow tests with:

```sh
backend/.venv/bin/python -m unittest backend.tests.test_live_transcription backend.tests.test_transcript_writer
```

For the database regression, use an explicitly provisioned disposable PostgreSQL
database with UTF-8 encoding, user `murmi_test`, database `postgres`, local trust
authentication, and a dedicated port. Never point this at a real session database:

```sh
MURMI_TEST_POSTGRES_PORT=55436 backend/.venv/bin/python -m unittest backend.tests.test_transcript_persistence
```

That integration test uses real PostgreSQL upserts and reloads, with a deliberately
injected lost acknowledgement. The API-event tests deliberately inject missing,
delayed, duplicated, and failed results; they are not speech recognition tests.

## Traditional Chinese presentation

The room's existing Traditional Chinese (`zh`) selection now displays transcripts
with OpenCC's `s2tw` conversion (`opencc-js` 1.4.2, `cn` → `tw`). This converts
characters to Taiwan-standard Traditional Chinese without the regional vocabulary
substitutions of `s2twp`. The dictionary bundle loads only for that selection.

Conversion is performed on the whole accumulated partial caption and each complete
entry. The underlying `entry.text`, per-item `transcriptionItems`, database values,
and argument-extraction input remain unchanged. Other room-language selections
show the original text. Existing saved transcripts are converted when displayed,
without rewriting their stored content.

The transcript panel offers a readable `.txt` download
in the selected script, and an original `.json` download including per-item
metadata. Downloads include completed entries and missing-segment markers;
unconfirmed partial captions are not included. The original JSON records the
display conversion separately from the unchanged source entries. Older sessions
can only export the source data they retained; this does not recover historical
audio or first-pass text that was never saved.

Run `node --test src/utils/transcript-text.test.mjs` from `frontend` for conversion,
cross-delta phrase context, vocabulary preservation and export-integrity checks.
These are deterministic text-conversion tests, not additional speech-model calls.


## Argument selection comparison

See [argument selection](../../docs/argument-selection.md) for a real-provider
comparison of the previous fragment extraction and the contextual selector, using
explicitly synthetic English and Traditional Chinese fixtures. The evaluation
requires an API key and makes paid calls; no application database is accessed.
