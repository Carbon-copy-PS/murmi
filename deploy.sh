#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_MAJOR=20

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y build-essential curl git

# Try to get Python 3.12 (has prebuilt wheels). Fall back to deadsnakes, then to whatever 3.10-3.12 exists.
if ! sudo apt-get install -y python3.12 python3.12-venv python3.12-dev 2>/dev/null; then
  echo "==> python3.12 not in default repos, trying deadsnakes PPA"
  sudo apt-get install -y software-properties-common
  sudo add-apt-repository -y ppa:deadsnakes/ppa
  sudo apt-get update
  sudo apt-get install -y python3.12 python3.12-venv python3.12-dev || true
fi

# Pick a Python that ships prebuilt wheels (avoid 3.13/3.14 source builds)
PYTHON_BIN=""
for cand in python3.12 python3.11 python3.10; do
  if command -v "$cand" >/dev/null 2>&1; then PYTHON_BIN="$cand"; break; fi
done
if [ -z "$PYTHON_BIN" ]; then
  echo "!! No suitable Python (3.10-3.12) found"; exit 1
fi
echo "==> Using $PYTHON_BIN ($($PYTHON_BIN --version))"
sudo apt-get install -y "${PYTHON_BIN}-venv" "${PYTHON_BIN}-dev" 2>/dev/null || true

echo "==> Ensuring swap (prevents OOM during any source build)"
if ! sudo swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Installing Node ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Installing pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "==> Setting up .env"
if [ ! -f "$DIR/.env" ]; then
  cp "$DIR/.env.example" "$DIR/.env"
  echo "!! Created .env from .env.example — add your OPENAI_API_KEY before traffic hits the app"
fi

echo "==> Setting up backend (Python venv)"
cd "$DIR/backend"
rm -rf .venv
"$PYTHON_BIN" -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn --version

echo "==> Setting up frontend (build)"
cd "$DIR/frontend"
rm -rf node_modules package-lock.json
npm install
npm run build

echo "==> Starting pm2 apps"
cd "$DIR"
pm2 delete debate-backend debate-frontend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "==> Enabling pm2 on boot"
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true
pm2 save

echo ""
echo "============================================"
echo "  Done. Apps running under pm2:"
pm2 ls
echo "============================================"
echo "  Frontend: http://<EC2_PUBLIC_IP>:5173"
echo "  Backend:  http://<EC2_PUBLIC_IP>:8000"
echo "  Logs:     pm2 logs"
echo "============================================"
