---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: Install Home Screens on Raspberry Pi or any Linux machine. Free, self-hosted smart display with drag-and-drop editor.
    alternates:
      canonical: /docs/getting-started
---

## Choose your install method

Home Screens can be deployed as a dedicated kiosk display on a Raspberry Pi, or run locally on your own machine for development and testing.

---

## Pre-built image {% .lead %}

The fastest way to get started. Download a ready-to-boot SD card image, flash it, and power on — no manual install needed.

Pre-built images are published for **major and minor releases** (e.g. v1.0.0, v1.1.0) but not patch releases. Each image includes Raspberry Pi OS Lite 64-bit with Home Screens pre-installed and configured for kiosk mode.

### Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended)
- A microSD card (16 GB+ recommended)
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/) installed on your computer
- A display connected via HDMI

### Download and flash

1. Go to the [Home Screens releases page](https://github.com/home-screens/home-screens/releases) and find the latest release that has an image file attached (e.g. `home-screens-v1.0.0.img.xz`)
2. Download the `.img.xz` file — you do not need to decompress it
3. Open **Raspberry Pi Imager**
4. Click **Choose Device** and select your Raspberry Pi model
5. Click **Choose OS**, scroll to the bottom, and select **Use custom**
6. Select the downloaded `.img.xz` file
7. Click **Choose Storage** and select your microSD card
8. Click **Next**, then **No** when asked to apply OS customization settings — the image is already configured

{% callout type="warning" %}
Raspberry Pi Imager hides its OS customization screen for custom images, so you cannot configure WiFi or SSH through the Imager UI. Use the `wifi.txt` method below for wireless connections instead. Ethernet works immediately with no configuration.
{% /callout %}

### WiFi setup

If your Pi will connect over WiFi instead of Ethernet, you need to configure it before first boot:

1. After flashing, remove and re-insert the microSD card so the boot partition mounts on your computer
2. Open the boot partition (labeled `bootfs`) in your file manager
3. Find the file `wifi.txt.example` and rename it to `wifi.txt`
4. Open `wifi.txt` in a text editor and fill in your network details:

```
SSID=Your Network Name
PASSWORD=your-wifi-password
COUNTRY=US
```

| Field | Required | Description |
|---|---|---|
| `SSID` | Yes | Your WiFi network name |
| `PASSWORD` | No | Your WiFi password (omit the line entirely for open networks) |
| `COUNTRY` | No | Two-letter country code (defaults to `US`) |
| `HIDDEN` | No | Set to `true` if your network is hidden (defaults to `false`) |

5. Save the file, eject the card, and insert it into your Pi

On first boot the Pi reads `wifi.txt`, connects to your network, and **deletes the file** so your credentials are not left in plaintext on the SD card.

### First boot

Insert the microSD card into your Pi and power it on. The first boot takes a minute or two while the system:

- Expands the filesystem to fill the SD card
- Detects your display's native resolution
- Connects to WiFi (if configured)
- Starts the Home Screens server and kiosk

Once booted, configure your screens by visiting `http://<pi-ip>:3000/editor` from another device on your network. To find your Pi's IP address, check your router's admin page or connected device list.

### Default SSH credentials

The pre-built image includes SSH enabled with the following default credentials:

| | |
|---|---|
| **Username** | `hs` |
| **Password** | `screens` |
| **Hostname** | `home-screens` |

You can connect with `ssh hs@home-screens.local` or `ssh hs@<pi-ip>`.

{% callout type="warning" %}
Change the default password after first login by running `passwd` over SSH. Anyone on your network can access the Pi with these credentials until you do.
{% /callout %}

For display orientation, service management, upgrading, and troubleshooting, see the full [Raspberry Pi guide](/docs/raspberry-pi).

---

## Install script {% .lead %}

If you prefer to install on an existing Raspberry Pi OS setup — or need a patch release that doesn't have a pre-built image — the install script sets up everything from scratch: Node.js, the pre-built app, Chromium in kiosk mode, and a systemd service.

### Requirements

- Raspberry Pi 4 or 5 (2 GB+ RAM recommended); RPI5 has significant performance improvements over RPI4 when it comes to larger displays and animations.
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported)
- A display connected via HDMI
- Network connection (Ethernet or Wi-Fi)

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh | bash
```

Or clone the repo first if you prefer to inspect the script before running it:

```bash
sudo apt install git
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
- [Modules Reference](/docs/modules) -- see all 38 available modules
