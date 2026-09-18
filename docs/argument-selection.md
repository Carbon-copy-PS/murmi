# Selecting arguments without turning every sentence into a card

The transcript and the voting cards have different jobs. The transcript preserves
what was said, including short replies and examples. Cards select substantive,
new positions that are useful for the room to consider. Not every sentence needs
a vote.

## Why cards were appearing so often

An older implementation collected several transcript entries and gave extraction
the discussion transcript. The live implementation later changed to analyzing
individual contributions. Immediately before this change, a two-second idle timer
triggered extraction of only the new suffix of a transcript entry, without recent
conversation context. A pause could therefore turn a sentence into its own request.
The model was asked to convert each completed contribution into at most one card.

The earlier prompt explicitly asked for the overall argument, “not every fragment.”
A subsequent fidelity-focused rewrite preserved nuance but removed that phrase.
These behaviors predated the PCA changes. More complete transcription can expose
more fragments to this path; this is a plausible mechanism, not a diagnosis of
every real session.

## Revised behavior

- Completed captions still appear and save immediately. Argument selection is a
  separate background task.
- A session collects a discussion window for at least 15 seconds. It normally
  runs after eight seconds without a new completed caption, or after 30 seconds
  even if captions keep arriving. Model processing time adds to this delay.
  Stopping the recorder flushes the pending window immediately.
- One selection request runs at a time per session. Continued speech queues the
  next window instead of canceling an in-progress request.
- The model receives full contributions, their newly added text, up to eight
  preceding transcript entries for context, the topic, and existing cards
  (including pending ones). It may select zero, one, or at most two arguments for
  the entire window. Two is a limit, not a target.
- Instructions favor one coherent claim with its essential conditions and reasons.
  Greetings, process talk, acknowledgements, incidental facts and repeated
  examples are not automatically cards. A genuine objection or minority position
  remains eligible even if it differs from an existing card.
- Cards cite contribution IDs. The application validates those IDs, preserves
  source text and speaker attribution, and rejects exact duplicate text. Semantic
  novelty and fidelity still depend on the model; valid references do not prove
  that every generated phrase is accurate.
- Existing cards, approvals and votes are not edited or merged. The full transcript
  remains available even when an argument is not selected. A window with more than
  two distinct positions may not put every position on a card; the limit is an
  intentional participation trade-off that should be reviewed in real sessions.

The live selection request uses the existing model with a 20-second timeout and
no SDK retries. A failed window is retried once after 30 seconds. After another
failure, it stays pending until new speech or an explicit recorder-stop flush.
An empty selection is a successful decision and is not retried to force a card.
Processing markers advance only for captured text after a successful selection;
speech arriving during the request remains pending. Queue state is in memory, so
pending extraction does not automatically resume after a server restart. Captions
continue through the existing independent transcript persistence path.

The older extraction methods remain for mock transcript injection and comparison.
The production completed-caption path uses contextual argument selection.

## Traditional Chinese display

The transcript now displays the chosen script without an original-text checkbox.
The readable download uses the same presentation. The original JSON download still
contains unmodified model text and item metadata for troubleshooting and research.

## Reproducible comparison

`backend/tests/fixtures/argument-selection.json` contains six explicitly synthetic
English and Traditional Chinese examples with human review notes. They cover
connected reasons, personal examples, procedural talk, repetition, conditional
support and two independent positions. They are not recordings from a real session.

With a real API key in the environment, run:

```sh
python -m backend.tools.evaluate_argument_selection \
  backend/tests/fixtures/argument-selection.json \
  --output artifacts/argument-review/provider-comparison.json
```

This makes paid provider calls. It does not connect to the application database.
The baseline simulates a pause after every supplied fragment, using the previous
turn extraction method. The candidate sends each complete fixture window to the
new selector. Human review notes are not sent to either model request.

In the recorded development comparison, the baseline produced 12 cards and the
candidate produced five. The three-fragment bus and clinic examples each became
one card, repeated examples produced none, both housing conditions stayed together,
and the two independent positions remained two cards. This small comparison checks
the intended behavior, not a general accuracy or card-reduction rate. Review the
saved outputs as well as counts; fewer cards alone is not a measure of quality.

Regression tests exercise window timing, serialized requests, continued speech,
bounded retries, source validation, context delivery and unchanged transcripts.
Browser checks verify the simplified transcript controls and unmodified original
JSON export on desktop and mobile. Real-session review is still needed to tune the
15–30 second window and the two-card limit.
