# Debate Sense

A web app for collaborative sense-making in live debates.

## The Idea

Imagine 10 people sitting in a room having a structured debate. Everyone opens the app on their phone or laptop and joins a shared session. The app listens, transcribes what's being said, and — here's the key part — uses AI to identify the core claims being made.

Once enough claims have been identified (currently 5 per round), the app prompts everyone to vote: **agree or disagree** on each statement. Votes are anonymous. Then the debate continues and the next round of claims accumulates.

The result is a real-time, structured picture of where the group stands — not just what was said, but what people actually think about it.

## How It Works

1. **One person creates a session** (optionally with a debate topic), others join via a 6-character code
2. **Recording starts** — all devices act as microphones, the strongest signal is automatically selected for transcription
3. **AI extracts claims** from the transcript as the debate progresses
4. **A progress bar** shows how many claims have been found so far
5. **At 5 claims**, the app switches to a voting screen where everyone votes agree/disagree
6. **The cycle repeats** — new claims accumulate toward the next voting round, while earlier claims remain votable

## Requirements

- **Python 3.10+**
- **Node.js 18+**
- **OpenAI API key** — used for speech-to-text (Whisper) and claim extraction (GPT-4o-mini). Set it in the `.env` file.

## Getting Started

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

./start.sh
```

This installs dependencies, starts the server, and opens the browser. The terminal shows a URL for phones on the same WiFi.

## Testing Without an API Key

The app works without an API key using built-in mock data. To test:

1. Run `./start.sh` (leave `.env` as-is)
2. Create a session in the browser
3. In a separate terminal, inject fake debate entries:
   ```bash
   curl -X POST http://localhost:8000/api/sessions/YOUR_CODE/mock
   ```
   Run this 3-5 times. Mock transcript entries and statements appear automatically.

## Current Status

This is an early prototype built during a single session. It works end-to-end but is not production-ready.

### What works
- Multi-device session joining via code
- Live audio capture with automatic strongest-signal selection
- Real-time transcription via OpenAI Whisper
- AI-powered claim extraction from transcript
- Anonymous agree/disagree voting with live tallies
- Voting rounds with automatic cycling
- Progress bar showing claim accumulation
- Browser notifications on key events
- Mock mode for testing without API keys

### To-do
- [ ] Persist sessions to a database (currently in-memory — lost on restart)
- [ ] Add a summary/results view after voting rounds
- [ ] Speaker diarization (who said what, beyond mic selection)
- [ ] Support for multiple languages in the same session
- [ ] HTTPS for production deployment (required for mic access on mobile)
- [ ] User authentication / session access control
- [ ] Export transcript and voting results
- [ ] AI-generated debate summary at end of session
- [ ] Mobile UI refinements
