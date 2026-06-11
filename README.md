# HearTheRoom

A web app for collaborative sense-making in live rooms.

## The Idea

Imagine 10 people in a room having a structured discussion. Everyone opens the app on their phone or laptop and joins a shared session. The app listens, transcribes what's being said, and — here's the key part — uses AI to identify the core claims being made.

Once enough claims have been identified (currently 5 per round), the app prompts everyone to vote: **agree or disagree** on each statement. Votes are anonymous. Then the conversation continues and the next round of claims accumulates.

The result is a real-time, structured picture of where the group stands — not just what was said, but what people actually think about it.

## How It Works

1. **One person creates a session** (optionally with a topic), others join via a 6-character code
2. **The session creator acts as the host recorder** — only that browser opens the microphone and streams audio
3. **Other participants listen, read captions, and vote** without sending microphone audio
4. **AI extracts claims** from completed speaker turns as the discussion progresses
5. **A progress bar** shows how many claims have been found so far
6. **At 5 claims**, the app switches to a voting screen where everyone votes agree/disagree
7. **The cycle repeats** — new claims accumulate toward the next voting round, while earlier claims remain votable

## Transcription Architecture

The current transcription flow is intentionally built around **one microphone per session**.

Earlier versions treated every joined device as a possible microphone and selected the loudest participant for transcription. That looked useful for a group setting, but it created several quality problems:

- Multiple nearby devices captured the same room audio with different delay, echo, gain, and noise profiles.
- Automatic "loudest mic" switching could fragment a single thought across devices.
- Short, low-context audio chunks made the speech model more likely to hallucinate plausible-looking text.
- Multilingual speech was especially unstable when the model had too little continuous context.
- Captions could lag because the system was trying to smooth partial fragments from several possible sources.

The new design makes the session creator the **host recorder**. The backend stores the host participant id and ignores recording controls or audio frames from non-host participants. This gives the transcription model one continuous audio stream with predictable browser audio constraints:

- mono input
- echo cancellation
- noise suppression
- automatic gain control
- 24 kHz PCM frames for realtime captions

Realtime transcription is used for live captions, but the app does not treat every partial caption as final truth. Audio for each completed speech item is buffered on the backend and sent through a final transcription pass before it is added to the transcript and used for claim extraction. The final pass is slower than partial captions, but it gives the AI more context and reduces fabricated transcript blocks.

The tradeoff is explicit:

- **Live captions** should feel immediate, but may still be imperfect while someone is speaking.
- **Final transcript entries and voting statements** should prioritize accuracy and continuity over instant display.

This is closer to how native transcription systems behave: they show tentative text quickly, then revise or finalize it after the utterance boundary is clear.

## Requirements

- **Python 3.10+**
- **Node.js 18+**
- **OpenAI API key** — used for realtime transcription, final transcription, and claim extraction. Set it in the `.env` file.

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
3. In a separate terminal, inject fake transcript entries:
   ```bash
   curl -X POST http://localhost:8000/api/sessions/YOUR_CODE/mock
   ```
   Run this 3-5 times. Mock transcript entries and statements appear automatically.

## Current Status

This is an early prototype built during a single session. It works end-to-end but is not production-ready.

### What works
- Multi-device session joining via code
- Host-only live audio capture
- Realtime captions with final transcription correction
- Per-speaker language preference for English, German/Swiss German, French, or auto-detect
- AI-powered claim extraction from completed speaker turns
- Anonymous agree/disagree voting with live tallies
- AI "common ground" mediator — host generates a shared group statement that bridges opinion clusters (inspired by Pol.is group-aware consensus + DeepMind's Habermas Machine)
- Voting rounds with automatic cycling
- Progress bar showing claim accumulation
- Browser notifications on key events
- Mock mode for testing without API keys

### To-do
- [ ] Persist sessions to a database (currently in-memory — lost on restart)
- [ ] Add a summary/results view after voting rounds
- [ ] Speaker diarization when a shared room microphone is used
- [ ] Better microphone setup guidance for host devices
- [ ] HTTPS for production deployment (required for mic access on mobile)
- [ ] User authentication / session access control
- [ ] Export transcript and voting results
- [ ] AI-generated session summary at end of session
- [ ] Mobile UI refinements
