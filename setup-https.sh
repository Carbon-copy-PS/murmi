#!/usr/bin/env bash
set -euo pipefail

# Usage: ./setup-https.sh <domain> [email]
# Example: ./setup-https.sh example.com you@example.com
#
# Run AFTER the domain DNS A record points to this server's public IP.

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: ./setup-https.sh <domain> [email]"
    echo "Example: ./setup-https.sh example.com you@example.com"
  exit 1
fi

if [ -z "$EMAIL" ]; then
  EMAIL="admin@${DOMAIN}"
fi

SITE_NAME=$(echo "$DOMAIN" | tr '.' '-')
SITE="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"

echo "==> Domain: ${DOMAIN}"
echo "==> Email:  ${EMAIL}"

echo "==> Installing nginx + certbot"
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Removing legacy nginx sites (if present)"
sudo rm -f /etc/nginx/sites-enabled/debate /etc/nginx/sites-available/debate

echo "==> Writing nginx site for ${DOMAIN}"
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

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
NGINX

sudo ln -sf "$SITE" "$ENABLED"
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
