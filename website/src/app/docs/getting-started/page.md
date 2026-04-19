---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: Install Home Screens on Raspberry Pi or any Linux machine. Free, self-hosted smart display with drag-and-drop editor.
    alternates:
      canonical: /docs/getting-started
---

## Overview

Most people install Home Screens on a Raspberry Pi using our pre-built image. **Start there** — it takes about 30 minutes end-to-end. If you already have a Pi running Raspberry Pi OS, the install script is a quicker path. If you just want to poke around on a laptop first, skip to [Local development](#local-development).

| Method | When to use | Time |
|---|---|---|
| **Pre-built image** (recommended) | Fresh Pi, fastest path to a working display | ~30 min |
| **Install script** | You already have a Pi running Raspberry Pi OS | ~15 min |
| **Local development** | You want to run it on your laptop to try it out or contribute | ~5 min |

Need hardware? See the [shopping list on the docs index](/docs) — total cost is around $90 plus a display.

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

1. {% latest-image-link /%} (you do not need to decompress it). Pre-built images ship for major and minor releases only — see all versions on the [Home Screens releases page](https://github.com/home-screens/home-screens/releases).
2. Keep the `.img.xz` file somewhere you can find it
3. Open **Raspberry Pi Imager**
4. Click **Choose Device** and select your Raspberry Pi model
5. Click **Choose OS**, scroll to the bottom, and select **Use custom**
6. Select the downloaded `.img.xz` file
7. Click **Choose Storage** and select your microSD card
8. Click **Next**. When Imager asks about applying OS customization, click **NO** — the image is already configured

{% callout type="warning" %}
**Do not click "Edit Settings" in Imager.** Imager hides its customization screen for custom images anyway, but if you click Edit Settings you'll be stuck. The "No" button skips it correctly. Ethernet works immediately with no configuration; use the `wifi.txt` method below for wireless.
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

Insert the microSD card into your Pi and power it on. **What you'll see:**

1. **Black screen** for 30–90 seconds while the Pi initializes
2. **Raspberry Pi rainbow splash** briefly
3. **Brief console text** while the filesystem expands and WiFi connects
4. **Home Screens starts rotating** — you're done booting

Total time: 2–3 minutes. If the screen is still black after 5 minutes, see [Troubleshooting](/docs/troubleshooting).

The first boot performs:

- Filesystem expansion to fill the SD card
- Display resolution detection
- WiFi connection (if configured)
- Home Screens server + kiosk startup

### Finding your Pi on the network

From any Mac, Linux, or Windows machine on the same network, open a terminal and run:

```bash
ping home-screens.local
```

That gives you the IP address. Then open the editor from any phone or laptop:

```
http://home-screens.local:3000/editor
```

If `home-screens.local` doesn't resolve (some routers don't support mDNS), check your router's admin page for a device named `home-screens` and use that IP instead.

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
- [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) recommended (Desktop also supported). In Raspberry Pi Imager, look under **Raspberry Pi OS (other)** to find the Lite image.
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
| iCal feeds | Subscribe to any iCal/ICS URL (Google, Apple, Outlook, Fastmail, etc.) | For calendar module (simplest path) |
| Google Calendar OAuth | OAuth client ID and secret for the calendar picker + native color-coding | Optional — only if you want OAuth instead of an iCal URL |
| OpenWeatherMap | Weather data provider | Optional (one of nine weather providers) |
| WeatherAPI | Weather data provider | Optional (one of nine weather providers) |
| Pirate Weather | Weather data provider (Dark Sky replacement) | Optional (one of nine weather providers) |
| NOAA | Free weather data (US only, no API key needed) | Optional (one of nine weather providers) |
| Open-Meteo | Free weather data (global coverage, no API key needed) | Optional (one of nine weather providers) |
| Yr.no | Free weather data (global, Norwegian Meteorological Institute, no API key needed) | Optional (one of nine weather providers) |
| SMHI | Free weather data (Nordic coverage, Swedish Meteorological and Hydrological Institute, no API key needed) | Optional (one of nine weather providers) |
| Met Office | Free weather data (UK coverage, no API key needed) | Optional (one of nine weather providers) |
| Environment Canada | Free weather data (Canadian cities, ECCC citypage feeds, no API key needed) | Optional (one of nine weather providers) |
| Google Maps | Google Routes API key for traffic module | For traffic module |
| TomTom | TomTom Routing API key (traffic fallback) | For traffic module |

## Password Protection

The editor supports optional password protection. Set a password in **Settings > Security** to require authentication before accessing the editor. The display authenticates separately using an auto-generated display token.

## System Management

The editor includes a system management panel under **Settings > System** for upgrade, rollback, backups, and power control -- particularly useful when running on a Raspberry Pi.

## Calendar setup

The calendar module has **one input — iCal feeds — and two ways to use it with Google Calendar**. Apple iCloud, Outlook, Fastmail, and most other services are just iCal URLs. Google Calendar works the same way (via its [private iCal address](https://support.google.com/calendar/answer/37648?hl=en)) **or** via OAuth if you want multi-calendar selection with native color-coding.

### Which Google option should I pick?

| | **iCal URL** (simple) | **OAuth** (advanced) |
|---|---|---|
| Setup time | ~2 min | ~10 min (Google Cloud project) |
| Credentials needed | None — just a URL | OAuth Client ID + Secret |
| Multi-calendar selection in editor | Add one URL per calendar | Pick-list of all your calendars |
| Native Google color-coding | No — you pick a color per feed | Yes |
| Refresh latency | Google caches ~hours | Near real-time |
| Works for shared / family calendars | Yes, if owner exposes the URL | Yes, after grant |
| Write access (future) | Never | Possible |

**Rule of thumb:** start with iCal. Only move to OAuth if you want the Google color-coding or the multi-calendar picker.

### Option 1 — iCal feeds (works for Google Calendar, Apple, Outlook, Fastmail, …)

1. Grab the iCal/ICS URL from your calendar provider.
   - **Google:** Calendar settings → *Settings for my calendars* → pick a calendar → **Secret address in iCal format** ([Google's guide](https://support.google.com/calendar/answer/37648?hl=en))
   - **Apple iCloud:** Calendar → right-click calendar → *Share Calendar* → *Public Calendar*
   - **Outlook/Microsoft 365:** Settings → *Shared calendars* → *Publish a calendar* → ICS link
2. In the editor, go to **Settings > Calendar > iCal Feeds**
3. Paste the URL, give it a name, pick a color — done

Repeat once per calendar you want displayed.

### Option 2 — Google OAuth (device flow)

OAuth uses Google's **Device Flow**, so you can authorize from any phone or laptop on your network — no redirect URI or public domain required. Ideal for headless displays.

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth Client ID**
3. Application type: **TVs and Limited Input devices**
4. Name it anything (e.g. "Home Screen Display")
5. Copy the **Client ID** and **Client Secret** into **Settings > Integrations** in the editor
6. Enable the **Google Calendar API** at APIs & Services > Library
7. In the editor, go to **Settings > Calendar > Sign in with Google**
8. You'll see a code and a link to `google.com/device` — enter the code on your phone or computer and grant access

### Zero-config defaults

Out of the box, **weather works worldwide with no setup** (Open-Meteo). You only need API keys if you want a specific provider (OpenWeatherMap, Pirate Weather, etc.) or extras like Immich photos, Todoist, or traffic routing.

## Update Channel

By default, Home Screens uses the **Stable** channel for updates, which only includes tested releases.

You can switch to the **Dev** channel in **Settings > System** to get pre-release builds for testing new features before they are officially released. Dev builds may contain breaking changes or incomplete functionality. If you encounter issues, switch back to the Stable channel to return to the latest stable release.

## Next Steps

- [Raspberry Pi guide](/docs/raspberry-pi) -- full deployment details, orientation, troubleshooting
- [Editor Guide](/docs/editor) -- learn how to build your screens
- [Module Reference](/docs/module-reference) -- every option for all 39 modules
