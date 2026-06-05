#!/usr/bin/env bash
set -euo pipefail

# Usage: ./setup-https.sh <domain> [email]
# Run this AFTER your domain's DNS A record points to this server's public IP.

DOMAIN="${1:-}"
EMAIL="${2:-admin@${DOMAIN}}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./setup-https.sh <domain> [email]"
  exit 1
fi

echo "==> Installing nginx + certbot"
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Writing nginx site for ${DOMAIN}"
SITE="/etc/nginx/sites-available/debate"
sudo tee "$SITE" >/dev/null <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket upgrade (covers /ws/* on the same location)
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
NGINX

sudo ln -sf "$SITE" /etc/nginx/sites-enabled/debate
sudo rm -f /etc/nginx/sites-enabled/default

echo "==> Testing & reloading nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Obtaining Let's Encrypt cert (auto-configures HTTPS + redirect)"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> Reloading nginx"
sudo systemctl reload nginx

echo ""
echo "============================================"
echo "  HTTPS ready: https://${DOMAIN}"
echo "  Mic/getUserMedia now works (secure context)."
echo "  Cert auto-renews via certbot systemd timer."
echo "============================================"
