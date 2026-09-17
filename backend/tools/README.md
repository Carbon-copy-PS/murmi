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
