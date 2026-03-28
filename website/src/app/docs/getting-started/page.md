---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: Install Home Screens on Raspberry Pi or any Linux machine. Free, self-hosted smart display with drag-and-drop editor.
---

## Choose your install method

Home Screens can be deployed as a dedicated kiosk display on a Raspberry Pi, or run locally on your own machine for development and testing.

---

## Raspberry Pi {% .lead %}

The recommended way to run Home Screens. The install script sets up everything on a fresh Raspberry Pi OS — Node.js, the pre-built app, Chromium in kiosk mode, and a systemd service.

### Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended); RPI5 has significant performance improvements over RPI4 when it comes to larger displays and animations.
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported)
- A display connected via HDMI
- Network connection (Ethernet or Wi-Fi)

### Install

```bash
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

After installation, reboot. The display starts automatically and you can configure it at `http://<pi-ip>:3000/editor` from another device on your network.

For display orientation, installer flags, service management, upgrading, and troubleshooting, see the full [Raspberry Pi guide](/docs/raspberry-pi).

---

## Local development {% .lead %}

Run Home Screens on your own machine for development or testing. This requires building from source.

### Prerequisites

- Node.js 22+
- npm

### Install

```bash
git clone https://github.com/home-screens/home-screens.git
cd home-screens
npm install
```

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm run start
```

Then visit:

- **Editor** -- `http://localhost:3000/editor` to configure your screens
- **Display** -- `http://localhost:3000/display` for the fullscreen kiosk view

---

## Configuration

All API keys and credentials are configured through the editor UI at **Settings > Integrations**. There is no need to manually edit environment files.

The following integrations can be configured through the editor:

| Integration | Description | Required |
|---|---|---|
| Google Calendar | OAuth client ID and secret for calendar sync | For calendar module |
| iCal feeds | Subscribe to any iCal/ICS URL (Outlook, Apple, etc.) | For calendar module |
| OpenWeatherMap | Weather data provider | Optional (one of five weather providers) |
| WeatherAPI | Weather data provider | Optional (one of five weather providers) |
| Pirate Weather | Weather data provider (Dark Sky replacement) | Optional (one of five weather providers) |
| NOAA | Free weather data (US only, no API key needed) | Optional (one of five weather providers) |
| Open-Meteo | Free weather data (global coverage, no API key needed) | Optional (one of five weather providers) |
| Google Maps | Google Routes API key for traffic module | For traffic module |
| TomTom | TomTom Routing API key (traffic fallback) | For traffic module |

## Password Protection

The editor supports optional password protection. Set a password in **Settings > Security** to require authentication before accessing the editor. The display authenticates separately using an auto-generated display token.

## System Management

The editor includes a system management panel under **Settings > System** for upgrade, rollback, backups, and power control -- particularly useful when running on a Raspberry Pi.

## Calendar Setup

The calendar module supports two types of sources: **Google Calendar** (via OAuth) and **iCal feeds** (any standard ICS URL).

### Google Calendar

Google Calendar uses **OAuth 2.0 Device Flow**, which means you can authorize from any device on your network -- no redirect URI or public domain required. This is ideal for headless displays.

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth Client ID**
3. Application type: **TVs and Limited Input devices**
4. Name it anything (e.g. "Home Screen Display")
5. Copy the **Client ID** and **Client Secret** into **Settings > Integrations** in the editor
6. Enable the **Google Calendar API** at APIs & Services > Library
7. In the editor, go to **Settings > Google Calendar > Sign in with Google**
8. You'll see a code and a link to `google.com/device` -- enter the code on your phone or computer and grant access

### iCal Feeds

You can subscribe to any calendar that provides an iCal/ICS URL -- including Outlook, Apple iCloud, Fastmail, or any other calendar service that publishes a `.ics` feed.

1. In the editor, go to **Settings > Calendar > iCal Feeds**
2. Add a feed by pasting the ICS URL
3. Give it a name and choose a color
4. Events from all configured iCal feeds appear alongside Google Calendar events in the calendar module

## Update Channel

By default, Home Screens uses the **Stable** channel for updates, which only includes tested releases.

You can switch to the **Dev** channel in **Settings > System** to get pre-release builds for testing new features before they are officially released. Dev builds may contain breaking changes or incomplete functionality. If you encounter issues, switch back to the Stable channel to return to the latest stable release.

## Next Steps

- [Raspberry Pi guide](/docs/raspberry-pi) -- full deployment details, orientation, troubleshooting
- [Editor Guide](/docs/editor) -- learn how to build your screens
- [Modules Reference](/docs/modules) -- see all 34 available modules
