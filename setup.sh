#!/usr/bin/env bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $1"; }
prompt()  { echo -e "${BOLD}[?]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
section() { echo -e "\n${BOLD}── $1 ──${NC}"; }

echo -e "${BOLD}"
echo "  Map Rotator — setup"
echo -e "${NC}"

# ── Collect config ────────────────────────────────────────────────────────────

section "Configuration"

prompt "mapy.com API key:"
read -r API_KEY
if [ -z "$API_KEY" ]; then
  echo -e "${RED}API key cannot be empty.${NC}" && exit 1
fi

prompt "Domain name (e.g. trotates.reggnox.cz):"
read -r DOMAIN
if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Domain cannot be empty.${NC}" && exit 1
fi

prompt "Port for Node.js to listen on internally [3000]:"
read -r PORT
PORT=${PORT:-3000}

prompt "Set up SSL with Let's Encrypt? (y/n) [y]:"
read -r DO_SSL
DO_SSL=${DO_SSL:-y}

# ── .env ─────────────────────────────────────────────────────────────────────

section "Creating .env"

cat > .env <<EOF
MAPY_API_KEY=${API_KEY}
PORT=${PORT}
EOF
chmod 600 .env
info ".env written"

# ── Node.js ───────────────────────────────────────────────────────────────────

section "Node.js"

if command -v node &>/dev/null; then
  info "Node.js already installed: $(node -v)"
else
  warn "Node.js not found — installing..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "aarch64" ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
  else
    # 32-bit ARM — use distro package
    sudo apt install -y nodejs npm
  fi
  info "Node.js installed: $(node -v)"
fi

# ── PM2 ───────────────────────────────────────────────────────────────────────

section "PM2"

if command -v pm2 &>/dev/null; then
  info "PM2 already installed"
else
  sudo npm install -g pm2
  info "PM2 installed"
fi

pm2 stop map-rotator 2>/dev/null || true
pm2 delete map-rotator 2>/dev/null || true
pm2 start server.js --name map-rotator
pm2 save

STARTUP_CMD=$(pm2 startup | grep "sudo env" || true)
if [ -n "$STARTUP_CMD" ]; then
  info "Enabling PM2 on boot..."
  eval "$STARTUP_CMD"
else
  warn "Run 'pm2 startup' manually and follow its instructions to enable autostart"
fi

info "App running on port ${PORT}"

# ── nginx ─────────────────────────────────────────────────────────────────────

section "nginx"

if ! command -v nginx &>/dev/null; then
  sudo apt install -y nginx
fi

NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"

sudo tee "$NGINX_CONF" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx
info "nginx configured for ${DOMAIN}"

# ── SSL ───────────────────────────────────────────────────────────────────────

if [[ "$DO_SSL" =~ ^[Yy]$ ]]; then
  section "SSL (Let's Encrypt)"

  if ! command -v certbot &>/dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
  fi

  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email || \
    warn "Certbot failed — make sure DNS is pointing to this machine and port 80 is open"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────

section "Firewall"

if command -v ufw &>/dev/null; then
  sudo ufw allow 'Nginx Full' 2>/dev/null && info "ufw: Nginx Full allowed" || true
else
  warn "ufw not found — make sure ports 80 and 443 are open"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}All done!${NC}"
if [[ "$DO_SSL" =~ ^[Yy]$ ]]; then
  echo -e "  ${BOLD}https://${DOMAIN}${NC}"
else
  echo -e "  ${BOLD}http://${DOMAIN}${NC}"
fi
echo ""
