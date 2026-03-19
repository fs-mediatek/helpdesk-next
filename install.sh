#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────────────────────
#  HelpDesk Core — Automated Installer for Ubuntu 22.04 / 24.04 LTS
# ─────────────────────────────────────────────────────────────────────────────

BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"

APP_DIR="/opt/helpdesk"
APP_USER="helpdesk"
DB_NAME="helpdesk"
DB_USER="helpdesk"
DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)
APP_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 40)
NODE_VERSION="20"
APP_PORT=3000

echo -e "${BOLD}${BLUE}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       HelpDesk Core — Installer          ║"
echo "  ║       IT Support & Asset Management      ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Bitte als root ausführen: sudo bash install.sh${NC}"
  exit 1
fi

# Check Ubuntu
if ! grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
  echo -e "${YELLOW}Warnung: Dieses Script ist für Ubuntu LTS optimiert.${NC}"
fi

echo -e "${GREEN}[1/7]${NC} Systemaktualisierung..."
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${GREEN}[2/7]${NC} Node.js $NODE_VERSION installieren..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  → Node $(node -v), npm $(npm -v)"

echo -e "${GREEN}[3/7]${NC} MariaDB installieren..."
if ! command -v mariadb &>/dev/null; then
  apt-get install -y -qq mariadb-server mariadb-client
  systemctl enable mariadb
  systemctl start mariadb
fi

# Create DB and user
echo -e "${GREEN}[4/7]${NC} Datenbank einrichten..."
mariadb -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mariadb -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mariadb -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mariadb -e "FLUSH PRIVILEGES;"
echo "  → Datenbank: ${DB_NAME}, Benutzer: ${DB_USER}"

echo -e "${GREEN}[5/7]${NC} Anwendung installieren..."
# Create system user
id -u $APP_USER &>/dev/null || useradd -r -m -s /bin/bash $APP_USER

# Copy application files
mkdir -p $APP_DIR
cp -r . $APP_DIR/
cd $APP_DIR

# Create .env.local
cat > .env.local <<EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
APP_SECRET_KEY=${APP_SECRET}
APP_URL=http://$(hostname -I | awk '{print $1}'):${APP_PORT}
NEXT_PUBLIC_APP_NAME=HelpDesk
EOF

# Install dependencies
npm ci --production=false --silent 2>/dev/null || npm install --silent
echo "  → Abhängigkeiten installiert"

echo -e "${GREEN}[6/7]${NC} Anwendung bauen..."
npx next build 2>&1 | tail -3

# Set ownership
chown -R $APP_USER:$APP_USER $APP_DIR

echo -e "${GREEN}[7/7]${NC} Systemdienst einrichten..."
cat > /etc/systemd/system/helpdesk.service <<EOF
[Unit]
Description=HelpDesk Core
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(which node) node_modules/.bin/next start -p ${APP_PORT}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable helpdesk
systemctl start helpdesk

# Get IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Installation erfolgreich abgeschlossen!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Zugriff:${NC}        http://${SERVER_IP}:${APP_PORT}"
echo -e "  ${BOLD}Ersteinrichtung:${NC} http://${SERVER_IP}:${APP_PORT}/setup"
echo ""
echo -e "  ${BOLD}Datenbank:${NC}"
echo -e "    Host:     localhost"
echo -e "    Name:     ${DB_NAME}"
echo -e "    Benutzer: ${DB_USER}"
echo -e "    Passwort: ${DB_PASS}"
echo ""
echo -e "  ${BOLD}Dienstverwaltung:${NC}"
echo -e "    systemctl status helpdesk"
echo -e "    systemctl restart helpdesk"
echo -e "    journalctl -u helpdesk -f"
echo ""
echo -e "  ${YELLOW}Bitte die Datenbank-Zugangsdaten sicher aufbewahren!${NC}"
echo ""
