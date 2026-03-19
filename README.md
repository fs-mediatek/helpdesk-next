# HelpDesk Core

**IT Support & Asset Management System** — Modernes, selbst gehostetes Helpdesk-System mit Ticketing, Bestellworkflows, Asset-Management, Onboarding und vielem mehr.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![MariaDB](https://img.shields.io/badge/MariaDB-10.6+-blue?logo=mariadb)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Kernfunktionen
- **Ticketsystem** — Erstellung, Zuweisung, Statusverfolgung, SLA-Überwachung
- **Bestellworkflows** — Konfigurierbarer Genehmigungsprozess für IT-Beschaffung
- **Produktkatalog** — Shop-Oberfläche mit Warenkorb und Sammelbestellungen
- **Asset-Management** — Windows, iOS, Android Geräteverwaltung mit Intune CSV-Import
- **On-/Offboarding** — Vollständiger Mitarbeiter-Onboarding-Prozess mit Workflow-Engine
- **Wissensdatenbank** — Interne Dokumentation und FAQs
- **Inventar & Lieferanten** — Warenbestand und Lieferantenverwaltung
- **Standortverwaltung** — Mehrere Standorte verwalten

### Administration
- **Rollenverwaltung** — Beliebige Rollen mit Farbcodierung, vererbbar über Abteilungen
- **Abteilungsbaum** — Hierarchische Abteilungen mit automatischer Rollenvererbung
- **Menü-Sichtbarkeit** — Rollenbasierte Navigation pro Menüpunkt
- **SLA-Management** — Regeln nach Kategorie, Abteilung, Priorität mit Eskalationsstufen
- **Nummerierung** — Konfigurierbare Ticket-/Bestellnummern-Formate
- **E-Mail-Versand** — SMTP/Gateway mit Test-Funktion

### Add-ons (Plugin-System)
- **Auswertungen** — KPIs, Agenten-Performance, Präsentations-Reports
- **Mobilfunkverträge** — Vertragsverwaltung mit Rechnungsabgleich
- **Netzwerk-Monitor** — Server-Überwachung
- **On-/Offboarding** — Erweiterte Workflows
- **Systemwartung** — Wartungsfenster planen

---

## Systemanforderungen

| Komponente | Minimum | Empfohlen |
|---|---|---|
| **Betriebssystem** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **CPU** | 2 vCPUs | 4 vCPUs |
| **RAM** | 2 GB | 4 GB |
| **Festplatte** | 20 GB SSD | 40 GB SSD |
| **Node.js** | 20.x | 20.x LTS |
| **Datenbank** | MariaDB 10.6+ | MariaDB 11.x |

---

## Installation

### Automatische Installation (empfohlen)

```bash
# Repository klonen
git clone https://github.com/YOUR_ORG/helpdesk-core.git
cd helpdesk-core

# Installer ausführen (als root)
sudo bash install.sh
```

Der Installer erledigt automatisch:
1. System-Updates
2. Node.js 20 LTS Installation
3. MariaDB Installation und Konfiguration
4. Datenbank und Benutzer anlegen
5. Abhängigkeiten installieren
6. Anwendung bauen
7. Systemd-Dienst einrichten

Nach Abschluss ist die Anwendung unter `http://SERVER-IP:3000/setup` erreichbar.

### Manuelle Installation

```bash
# 1. Node.js 20 installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. MariaDB installieren
sudo apt-get install -y mariadb-server
sudo systemctl enable mariadb

# 3. Datenbank einrichten
sudo mariadb -e "CREATE DATABASE helpdesk CHARACTER SET utf8mb4;"
sudo mariadb -e "CREATE USER 'helpdesk'@'localhost' IDENTIFIED BY 'SICHERES_PASSWORT';"
sudo mariadb -e "GRANT ALL ON helpdesk.* TO 'helpdesk'@'localhost';"

# 4. Anwendung konfigurieren
cp .env.example .env.local
nano .env.local  # Zugangsdaten anpassen

# 5. Installieren und bauen
npm install
npx next build

# 6. Starten
npx next start -p 3000
```

### Ersteinrichtung

1. Browser öffnen: `http://SERVER-IP:3000/setup`
2. Admin-Account erstellen (Name, E-Mail, Passwort)
3. Firmendaten eingeben
4. Fertig — Weiterleitung zum Dashboard

---

## Dienstverwaltung

```bash
# Status prüfen
sudo systemctl status helpdesk

# Neustart
sudo systemctl restart helpdesk

# Logs anzeigen
sudo journalctl -u helpdesk -f

# Stoppen
sudo systemctl stop helpdesk
```

## Update

```bash
cd /opt/helpdesk
sudo systemctl stop helpdesk
git pull
npm install
npx next build
sudo systemctl start helpdesk
```

---

## Technologie-Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend**: Next.js App Router (API Routes), Server Components
- **Datenbank**: MariaDB / MySQL
- **Auth**: JWT (HttpOnly Cookies)
- **E-Mail**: Nodemailer (SMTP / Gateway)

---

## Lizenz

MIT License — Frei verwendbar, auch kommerziell.
