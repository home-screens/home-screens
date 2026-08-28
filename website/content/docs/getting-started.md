---
title: Installation
nextjs:
  metadata:
    title: Installation
    description: Install Home Screens on a Raspberry Pi with the pre-built image or the install script. Free, self-hosted smart display with drag-and-drop editor.
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

Total time: 2–3 minutes. If the screen is still black after 5 minutes, see [First boot troubleshooting](/docs/troubleshooting#first-boot).

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

Running Pi OS **Desktop** instead of Lite? Add the `--desktop` flag, which needs the `-s --` form when you pipe the script:

```bash
curl -fsSL https://raw.githubusercontent.com/home-screens/home-screens/main/scripts/install.sh | bash -s -- --desktop
```

The full flag list is in the [Raspberry Pi guide](/docs/raspberry-pi).

After installation, reboot. The display starts automatically and you can configure it at `http://<pi-ip>:3000/editor` from another device on your network.

For display orientation, installer flags, service management, upgrading, and troubleshooting, see the full [Raspberry Pi guide](/docs/raspberry-pi).

---

## Local development {% .lead %}

Run Home Screens on your own machine for development or testing. This requires building from source.

### Prerequisites

- Node.js 22+
- npm **11.6.3 or newer**. Anything older stops the install with an `EBADENGINE` error, because npm 10 downloads prebuilt binaries for every platform instead of just yours and ends up with a much larger `node_modules`. Node 22 still ships npm 10, so check with `npm -v` first.

### Install

```bash
git clone https://github.com/home-screens/home-screens.git
cd home-screens
npm install -g npm@11.6.3   # only if `npm -v` is older; newer is fine
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

Everything is set up in the editor; you never need to edit environment files by hand. Most keys live in **Settings > API keys**, with two exceptions worth knowing: weather keys are entered next to each provider on **Settings > Weather**, and iCloud sign-in lives on **Settings > Calendar**.

Everything you configure is saved in one folder on the Pi, `/opt/home-screens/current/data/` (`config.json` holds your screens, `secrets.json` holds your keys). Upgrades leave that folder alone, and you can download a copy of it from **Settings > Backups & data**.

### Calendars (Settings > Calendar)

Three ways to get events in: **iCal feeds** (any ICS URL), **Google OAuth**, and **iCloud**. [Calendar setup](#calendar-setup) below walks through all three and helps you pick.

### Weather providers (Settings > Weather)

Pick one provider as your default; keys are entered on the provider's own card, not on the API keys page. {% $stats.weatherProviderCount %} providers ship built in.

| Provider | Coverage | API key |
|---|---|---|
| Open-Meteo | Global | Not needed (this is the default) |
| NOAA | United States | Not needed |
| Yr.no | Global (Norwegian Meteorological Institute) | Not needed |
| SMHI | Nordic (Swedish Meteorological and Hydrological Institute) | Not needed |
| Environment Canada | Canadian cities (ECCC citypage feeds) | Not needed |
| OpenWeatherMap | Global | Required (free tier available) |
| WeatherAPI | Global | Required (free tier available) |
| Pirate Weather | Global (Dark Sky replacement) | Required (free tier available) |
| Met Office | United Kingdom | Required — sign up at datahub.metoffice.gov.uk and subscribe to the Site-Specific API |

### API keys (Settings > API keys)

| Integration | Description | Required |
|---|---|---|
| Google Maps | Google Routes API key for the traffic module | For traffic module |
| TomTom | Alternative to Google Maps for traffic. Enable **Geocoding API**, **Reverse Geocoding API**, and **Routing API** on the key (per-key, not just account-wide). | For traffic module |
| Immich | Server URL + API key for your self-hosted photo library | For Immich photos in the photo-slideshow module |
| Microsoft OneDrive | Application (client) ID from a free app registration, then a one-time sign-in in the module (see [OneDrive photos](/docs/modules#one-drive-photos)) | For OneDrive photos in the photo modules |
| Unsplash | Access key for HD background photos. The free tier allows 50 requests per hour. | Optional — for Unsplash backgrounds |
| NASA | API key for the Astronomy Picture of the Day (1,000 requests per hour). Image Library search works without a key. | Optional — for NASA imagery |
| Todoist | API token, checked when you save it | For todoist module |
| GitHub | A personal access token, only used for update checks. Raises the rate limit from 60 to 5,000 requests per hour. | Optional |

## Password Protection

**The editor has no password until you set one**, so until then anyone on your home network can open it and change your screens. Set a password in **Settings > Security** to require a sign-in. It covers the editor and the phone remote at `/remote`; the kids' chore view at `/chores` deliberately stays open. The display signs in on its own using an auto-generated display token.

The same page has an IP allowlist, so you can let displays on trusted networks skip the sign-in, or block everything outside those networks entirely. If you forget the password, delete `data/auth.json` on the Pi and set a new one.

## System Management

The editor includes a system management panel under **Settings > System & updates** for updates, rollback, and power control -- particularly useful when running on a Raspberry Pi. Config snapshots live on their own page, **Settings > Backups & data**.

## Calendar setup

The calendar module has three ways to get events in. **iCal feeds** are the universal path — Outlook, Fastmail, and most other services are just iCal URLs, and Google Calendar works that way too (via its [private iCal address](https://support.google.com/calendar/answer/37648?hl=en)). If you want more, there are two account sign-ins: **Google OAuth** for multi-calendar selection with native color-coding, and **iCloud** for Apple calendars (plus contact birthdays) without making anything public.

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

**Rule of thumb:** start with iCal. Only move to OAuth if you want the Google color-coding or the multi-calendar picker. For Apple calendars, the iCloud sign-in (Option 3) is usually nicer than public iCal links.

### Option 1 — iCal feeds (works for Google Calendar, Apple, Outlook, Fastmail, …)

1. Grab the iCal/ICS URL from your calendar provider.
   - **Google:** Calendar settings → *Settings for my calendars* → pick a calendar → **Secret address in iCal format** ([Google's guide](https://support.google.com/calendar/answer/37648?hl=en))
   - **Apple iCloud:** Calendar → right-click calendar → *Share Calendar* → *Public Calendar*
   - **Outlook/Microsoft 365:** Settings → *Shared calendars* → *Publish a calendar* → ICS link
2. In the editor, go to **Settings > Calendar > iCal / ICS Feeds**
3. Paste the URL, give it a name, pick a color — done

Repeat once per calendar you want displayed.

### Option 2 — Google OAuth (device flow)

OAuth uses Google's **Device Flow**, so you can authorize from any phone or laptop on your network — no redirect URI or public domain required. Ideal for headless displays.

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth Client ID**
3. Application type: **TVs and Limited Input devices**
4. Name it anything (e.g. "Home Screen Display")
5. Copy the **Client ID** and **Client Secret** into **Settings > API keys** in the editor
6. Enable the **Google Calendar API** at APIs & Services > Library
7. In the editor, go to **Settings > Calendar > Sign in with Google**
8. You'll see a code and a link to `google.com/device` — enter the code on your phone or computer and grant access

### Option 3 — iCloud calendars (app-specific password)

Sign in to iCloud with an **app-specific password** — a password you create just for Home Screens, so your real Apple ID password is never stored. Your calendars stay private; nothing has to be shared publicly.

1. Go to [account.apple.com](https://account.apple.com) > **Sign-In and Security > App-Specific Passwords** and create one (name it anything, e.g. "Home Screens")
2. In the editor, go to **Settings > Calendar > iCloud Calendar**, click **Add iCloud account**, and enter your Apple ID email and the app-specific password — you can add more than one account
3. Pick which calendars to display — Apple's calendar colors carry over automatically
4. Optionally turn on the **Birthdays** calendar, built from the birthdays saved in your contacts

### What works without an API key

**Weather needs no API key.** A new install starts on Open-Meteo, which is free and covers the whole world. It does need to know where you are, though: open **Settings > Location & language** and set your location, or a weather module will have nothing to show.

You only need a key if you want a specific provider (OpenWeatherMap, WeatherAPI, Pirate Weather, or the Met Office) or extras like Immich or OneDrive photos, Todoist, or traffic routing.

## Update Channel

By default, Home Screens uses the **Stable channel** for updates, which only includes tested releases.

To get early builds instead, go to **Settings > System & updates**, turn on **Show advanced options**, then switch the channel from **Stable channel** to **Pre-release channel**. Pre-release builds let you try new features before they are officially released, but they may contain breaking changes or unfinished work. If you run into trouble, switch back to the Stable channel to return to the latest stable release.

## Removing Home Screens

There is no uninstall script yet. If you installed with the install script and want the Pi back the way it was, take a backup of your settings first from **Settings > Backups & data**, then run these over SSH:

```bash
sudo systemctl disable --now home-screens
sudo rm -rf /opt/home-screens
sudo rm /etc/systemd/system/home-screens.service
sudo rm /etc/systemd/system/getty@tty1.service.d/autologin.conf
sudo systemctl daemon-reload
rm -rf ~/.config/labwc
```

Then open `~/.bash_profile` and delete the Home Screens block near the bottom, which is what launches the kiosk at login. If you want the Raspberry Pi desktop back, run `sudo systemctl set-default graphical.target` and re-enable your display manager. If you used the pre-built image, the simplest route is to flash the SD card with plain Raspberry Pi OS.

## Next Steps

- [Raspberry Pi guide](/docs/raspberry-pi) -- full deployment details, orientation, troubleshooting
- [Editor Guide](/docs/editor) -- learn how to build your screens
- [Module Reference](/docs/module-reference) -- every option for all {% $stats.moduleCount %} modules
