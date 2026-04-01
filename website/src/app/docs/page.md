---
title: Getting started
nextjs:
  metadata:
    title: Documentation
    description: Documentation for Home Screens — a free, open-source smart display for Raspberry Pi. A self-hosted alternative to MagicMirror and Dakboard with a visual editor.
---

An open-source smart display system for Raspberry Pi. 38 modules, visual editor, 5 weather providers. Free forever. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/getting-started" description="Step-by-step guide to getting Home Screens up and running on your machine." /%}

{% quick-link title="Modules" icon="presets" href="/docs/modules" description="Explore all built-in modules — from clocks and weather to calendars and sports." /%}

{% quick-link title="Editor Guide" icon="plugins" href="/docs/editor" description="Learn how to design your screens with the drag-and-drop visual editor." /%}

{% quick-link title="API Reference" icon="theming" href="/docs/api" description="Complete reference for all API endpoints — weather, calendar, stocks, and more." /%}

{% /quick-links %}

---

## What is Home Screens?

Home Screens is a custom smart display system that replaces services like Dakboard and MagicMirror. It's web-based, runs on a Raspberry Pi in Chromium kiosk mode, and renders on a portrait 1080×1920 display.

### Key features

- **38 modules** — clock, weather, calendar, news, stocks, sports, and more
- **Visual editor** — drag-and-drop interface to design your screens
- **5 weather providers** — OpenWeatherMap, WeatherAPI, Pirate Weather, NOAA, Open-Meteo
- **Google Calendar** — OAuth device flow, works on headless displays
- **Profile system** — named screen groups with schedule-based auto-activation
- **No cloud required** — all data stored locally as JSON, no accounts needed

### Tech stack

Home Screens is built with Next.js 16, React 19, and Tailwind CSS. Configuration is stored as a single JSON file — no database required.

### Quick start

**Raspberry Pi** (recommended) — run the install script on a fresh Raspberry Pi OS:

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh
```

After reboot, the display starts automatically. Configure at `http://<pi-ip>:3000/editor` from another device.

**Local development** — run on your own machine for development or testing:

```bash
git clone https://github.com/home-screens/home-screens.git
cd home-screens
npm install
npm run dev
```

Then visit `http://localhost:3000/editor` to start building your display.

See the [Installation guide](/docs/getting-started) for full details.

---

## Getting help

If you run into issues or have questions:

- [GitHub Issues](https://github.com/home-screens/home-screens/issues) — report bugs or request features
- [GitHub Discussions](https://github.com/home-screens/home-screens/discussions) — ask questions and share your setup
- [Releases](https://github.com/home-screens/home-screens/releases) — check for the latest version
