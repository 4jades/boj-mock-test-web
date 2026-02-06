#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/boj-mock-web}"
NODE_VERSION="${NODE_VERSION:-20}"
RUNNER_WORK_ROOT="${RUNNER_WORK_ROOT:-/tmp/boj-mock-run}"
SERVICE_NAME="boj-mock"

echo "[1/8] Installing base packages..."
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates gnupg lsb-release build-essential

echo "[2/8] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl start docker
fi
sudo usermod -aG docker "$USER"

echo "[3/8] Installing Node.js via nvm..."
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION"
  nvm alias default "$NODE_VERSION"
fi

echo "[4/8] Installing Caddy..."
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "[5/8] Preparing app directory..."
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

if [[ "$PWD" != "$APP_DIR" ]]; then
  echo "Copying current repo to $APP_DIR ..."
  rsync -a --delete ./ "$APP_DIR/"
fi

cd "$APP_DIR"

echo "[6/8] Installing dependencies and building web..."
npm --prefix web install
npm --prefix web run build
npm --prefix server install

echo "[7/8] Writing .env..."
cat > "$APP_DIR/.env" <<EOF
PORT=5179
RUNNER_MODE=docker
RUNNER_WORK_ROOT=$RUNNER_WORK_ROOT
MAX_CONCURRENT_RUNS=2
RUN_TIMEOUT_MS=2000
COMPILE_TIMEOUT_MS=12000
MAX_STDOUT_BYTES=65536
MAX_STDERR_BYTES=65536
SESSION_TTL_HOURS=24
EOF

echo "[8/8] Initializing runner containers..."
mkdir -p "$RUNNER_WORK_ROOT"
node server/scripts/runner-init.js

echo "Installing systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<EOF
[Unit]
Description=BOJ Mock Test Server
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) server/src/index.js
Restart=always
RestartSec=2
User=$USER

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

echo "Configuring Caddy..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
:80 {
  reverse_proxy 127.0.0.1:5179
}
EOF

sudo systemctl restart caddy

echo "Done. Service: ${SERVICE_NAME}. Access via http://<YOUR_VM_IP>/"
echo "Note: For HTTPS, attach a domain and update Caddyfile."
echo "If docker permission errors occur, log out/in to apply docker group membership."
