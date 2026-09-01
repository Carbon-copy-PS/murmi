# Murmi

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A web app for collaborative sense-making in live rooms. A host records the conversation; Murmi transcribes it, extracts claims, and lets everyone vote agree or disagree anonymously.

The hosted product at [murmi.org](https://murmi.org) is operated by [Carbon Copy Association](https://carbon-copy.org). This repository is the source code you can run yourself.

## Why?

- Spoken workshops produce insight that disappears when the meeting ends.
- Live captions are not enough: groups need the *claims* people are actually making.
- Anonymous votes show where a room agrees, disagrees, or is split — without putting anyone on the spot.
- Common-ground drafts and end-of-session reports turn a discussion into something the group can take away.

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** (20 is what CI uses)
- **OpenAI API key** (optional) — realtime captions, final transcription, and claim extraction. Leave the placeholder in `.env` to run in mock mode.
- **PostgreSQL** (optional) — leave `POSTGRES_HOST` empty for in-memory sessions that reset on restart.

## Install and quick start

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY if you want live transcription

./start.sh
```

This installs dependencies, starts the FastAPI backend on port 8000 and the Vite frontend on port 5173, and opens the browser. The terminal also prints a LAN URL so phones on the same Wi-Fi can join.

### How a session works

1. One person creates a session (optionally with a topic). Others join with a 6-character code.
2. The session creator is the **host recorder** — only that browser opens the microphone.
3. Everyone else follows captions and votes. They do not send audio.
4. AI extracts claims from completed speaker turns.
5. When enough claims accumulate (5 per round by default), the group votes agree/disagree. Votes are anonymous.
6. The cycle repeats. Earlier claims stay votable.
7. The host can generate a common-ground mediation statement and a session report.

UI languages: English, German, French, Italian, and Traditional Chinese. Transcription can follow a per-speaker language preference or auto-detect.

### Testing without an API key

1. Run `./start.sh` with `.env` left as `OPENAI_API_KEY=your-key-here`.
2. Create a session in the browser.
3. Inject mock transcript entries:

```bash
curl -X POST http://localhost:8000/api/sessions/YOUR_CODE/mock
```

Run this a few times. Mock transcript lines and statements appear automatically.

## Configuration

Copy [`.env.example`](.env.example) to `.env`. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for live transcription and claim extraction. Placeholder enables mock mode. |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | Realtime caption model (default `gpt-4o-transcribe`). |
| `OPENAI_FINAL_TRANSCRIPTION_MODEL` | Final-pass transcription model. |
| `POSTGRES_HOST` | Empty = in-memory. Set to `localhost` (or your host) to persist sessions. |
| `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database connection. Defaults are local-dev only. |
| `SESSION_TTL_HOURS` | How long a session and its content live before deletion (default 48). |
| `SESSION_PURGE_INTERVAL_MINUTES` | How often expired sessions are swept. |

Production microphone access on phones needs HTTPS. After deploying the backend (see [`deploy.sh`](deploy.sh)), run [`setup-https.sh`](setup-https.sh) with your domain.

## Architecture

```text
Host browser  --audio-->  FastAPI + WebSockets  --OpenAI-->  captions + claims
Other browsers <----------------- votes, tallies, reports ----------------
```

- **Frontend:** React 18 + Vite (`frontend/`).
- **Backend:** FastAPI (`backend/app/`). Host-only audio; non-host recording frames are ignored.
- **Persistence:** optional Postgres via SQLAlchemy async; otherwise in-memory.
- **Analysis:** claim extraction, Pol.is-inspired opinion clustering, common-ground drafts, HTML reports.
- **Offline analysis scripts:** [`data-analysis/`](data-analysis/) converts session exports and builds aggregate reports. Raw session files and generated reports are gitignored.

Live captions are intentionally tentative. Each completed speech item is buffered and run through a final transcription pass before it is stored and used for claims.

## What works today

- Multi-device join via session code
- Host-only live audio, realtime captions, and final transcription
- Per-speaker language preference
- AI claim extraction and anonymous agree/disagree voting
- Common-ground mediator (opinion clusters + a shared draft)
- Session reports and opinion-landscape analysis
- Optional Postgres persistence and session TTL
- Mock mode without an API key
- Deploy helpers (`deploy.sh`, `setup-https.sh`, PM2 `ecosystem.config.js`)

## Troubleshooting

- **No captions / no claims:** confirm `OPENAI_API_KEY` is set, or use the mock `curl` endpoint above.
- **Mic button missing on a phone:** use HTTPS (or `localhost`). Browsers block `getUserMedia` on insecure origins.
- **Phones cannot join:** use the LAN URL printed by `start.sh`, and allow port 5173 (dev) or 8000 (production build served by the backend).
- **Sessions vanish after restart:** set `POSTGRES_HOST` and run Postgres; in-memory mode is the default.
- **Do not commit** `.env`, `data-analysis/sessions/`, or `data-analysis/reports/`. They can contain secrets or participant data.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the pull-request process. Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Report vulnerabilities privately. Do not file public issues for security problems. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE). Copyright 2026 Carbon Copy Association.
