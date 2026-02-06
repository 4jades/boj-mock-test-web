#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-boj-mock-test.duckdns.org}"
SUBDOMAIN="${SUBDOMAIN:-boj-mock-test}"
TOKEN="${DUCKDNS_TOKEN:-}"
SERVICE_NAME="duckdns"

if [[ -z "$TOKEN" ]]; then
  echo "DUCKDNS_TOKEN is required."
  echo "Usage: DUCKDNS_TOKEN=your_token DOMAIN=boj-mock-test.duckdns.org SUBDOMAIN=boj-mock-test bash deploy/duckdns-setup.sh"
  exit 1
fi

echo "[1/4] Installing curl..."
sudo apt-get update -y
sudo apt-get install -y curl

echo "[2/4] Writing DuckDNS updater script..."
sudo install -d -m 0755 /opt/duckdns
sudo tee /opt/duckdns/update.sh > /dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
curl -fsS "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${TOKEN}&ip=" >/opt/duckdns/duck.log
EOF
sudo chmod +x /opt/duckdns/update.sh

echo "[3/4] Creating systemd service and timer..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=DuckDNS updater

[Service]
Type=oneshot
ExecStart=/opt/duckdns/update.sh
EOF

sudo tee /etc/systemd/system/${SERVICE_NAME}.timer > /dev/null <<EOF
[Unit]
Description=Run DuckDNS updater every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ${SERVICE_NAME}.timer

echo "[4/4] Setting Caddy domain..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${DOMAIN} {
  reverse_proxy 127.0.0.1:5179
}
EOF

sudo systemctl restart caddy

echo "Done. DuckDNS auto-update enabled and Caddy configured for https://${DOMAIN}"
