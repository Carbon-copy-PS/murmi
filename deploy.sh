#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_MAJOR=20
PYTHON_VERSION=3.12

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y build-essential curl git

echo "==> Installing uv (distro-independent Python + wheels)"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

echo "==> Installing standalone CPython ${PYTHON_VERSION} via uv"
uv python install "$PYTHON_VERSION"

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

echo "==> Setting up backend (uv venv)"
cd "$DIR/backend"
rm -rf .venv
uv venv --python "$PYTHON_VERSION" .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/uvicorn --version

echo "==> Building frontend (served by backend from frontend/dist)"
cd "$DIR/frontend"
rm -rf node_modules
npm ci
npm run build

echo "==> Starting pm2 apps"
cd "$DIR"
pm2 delete hear-backend debate-backend debate-frontend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "==> Enabling pm2 on boot"
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true
pm2 save

echo ""
echo "============================================"
echo "  Done. Backend (serves frontend too) under pm2:"
pm2 ls
echo "============================================"
echo "  Local: http://127.0.0.1:8000  (bound to localhost)"
echo "  Next:  point DNS to this server, then run ./setup-https.sh <domain>"
echo "  Logs:  pm2 logs hear-backend"
echo "============================================"
