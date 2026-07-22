#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# Get local IP so phones on the same WiFi can connect
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")

# Check for .env
if [ ! -f "$DIR/.env" ]; then
  if [ -f "$DIR/.env.example" ]; then
    cp "$DIR/.env.example" "$DIR/.env"
    echo "Created .env from .env.example — edit it to add your OPENAI_API_KEY"
    echo "Then re-run this script."
    exit 1
  fi
fi

# Install backend deps if needed
if [ ! -d "$DIR/backend/.venv" ]; then
  echo "Setting up backend..."
  python3 -m venv "$DIR/backend/.venv"
  "$DIR/backend/.venv/bin/pip" install -q -r "$DIR/backend/requirements.txt"
fi

# Install frontend deps if needed
if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo "Setting up frontend..."
  (cd "$DIR/frontend" && npm install --silent)
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Start backend (bind to 0.0.0.0 so phones can reach it)
echo "Starting backend..."
(cd "$DIR/backend" && source .venv/bin/activate && \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &
BACKEND_PID=$!

# Start frontend (bind to 0.0.0.0 so phones can reach it)
echo "Starting frontend..."
(cd "$DIR/frontend" && npx vite --host 0.0.0.0 --port 5173) &
FRONTEND_PID=$!

# Wait for frontend to be ready, then open browser
sleep 3
open "http://localhost:5173" 2>/dev/null || true

echo ""
echo "============================================"
echo "  HearTheRoom is running"
echo "============================================"
echo "  Browser:  http://localhost:5173"
echo "  Phone:    http://${LOCAL_IP}:5173"
echo "  Backend:  http://localhost:8000"
echo "============================================"
echo "  Press Ctrl+C to stop"
echo "============================================"
echo ""

wait
