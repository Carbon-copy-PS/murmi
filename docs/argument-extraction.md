# Real-time argument extraction

Completed captions are saved and broadcast immediately. A serial worker per session
selects voting cards after 4 seconds without a completed caption, with a 3-second
minimum and 10-second maximum batching wait. The maximum is a scheduling bound,
not an end-to-end latency guarantee: a prior request, provider time, transcription,
network delivery and host approval can add delay.

The selector uses the existing extraction model and routing settings. It selects
each distinct substantive position, preserves conditions and personal experience,
and compares against all existing cards, including pending cards. There is no
minimum card quota. Six cards per response is a safety limit; excess sources are
deferred rather than silently consumed.

The response contract is:
```json
{"arguments":[{"text":"A qualified position","sourceIds":["turn-id"]}],"deferredSourceIds":[]}
```
Invalid structure, unknown source IDs, refusal or truncation fail the window without
marking it processed. Provider failure retains the existing bounded retry behavior.

Unfinished or unselected substantive sources retain their previously analyzed
prefix and an `argumentDeferred` marker in the saved transcript. The next speech
batch includes deferred sources among the last 12 transcript entries, plus up to
eight other context entries. Deferred sources do not create idle requests. Older
sources remain stored but fall outside automatic reconsideration; this is a bounded
conversation window, not a promise to recover every idea from the whole session.
A source may be both selected and deferred if it contains several ideas.

Each request uses captured text. Speech arriving during generation queues the next
batch and is not marked analyzed by the older request. Selected cards enter the
duplicate check before the next request. Host approval behavior is unchanged.

## Local evaluation

Use a pinned baseline commit so the comparison remains meaningful after commits:
```sh
.venv/bin/python -m backend.tools.compare_argument_flow \
  --baseline-ref aaea680 \
  --env-file .env.model-experiments \
  --output outputs/argument-comparison.json
```
The tool runs synthetic English/Chinese cases with the same model and parameters.
An optional anonymized recorded export can be supplied with `--recorded`;
`--start-entry` and `--end-entry` select a bounded excerpt, with preceding context.
Output includes sensitive evidence if recorded input is used: keep it private and
outside Git. Timing uses virtual caption arrival scheduling and measured API
duration, not a live browser latency benchmark. Single-run model comparisons are
qualitative evidence, not statistical accuracy estimates.

Regression coverage lives in `backend/tests/test_argument_extraction.py`:
batching, concurrent speech, stop flush, bounded retries, source validation,
overflow deferral, unfinished cross-window claims, intervening context and bounded
carry-over. Report and frontend layouts are unchanged.

Before deployment, review the generated cards for unsupported implications,
over-fragmentation and duplicates, and check the request-volume trade-off. Approval
delay remains separate from extraction latency.
