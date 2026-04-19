---
title: Getting started
nextjs:
  metadata:
    title: Documentation
    description: Documentation for Home Screens — a free, open-source smart display for Raspberry Pi. A self-hosted alternative to MagicMirror and Dakboard with a visual editor.
    alternates:
      canonical: /docs
---

A free, open-source smart display for your kitchen, hallway, or family command center. Runs on a Raspberry Pi, configured from your phone, with 39 built-in modules. **About 30–45 minutes from unboxing to first screen.** {% .lead %}

---

## Your weekend project

1. **Buy the hardware** — about $200 if you're starting from scratch, or ~$90 if you already have a monitor lying around. [Shopping list below](#what-to-buy).
2. **Flash the SD card** — download our ready-to-boot image, flash with Raspberry Pi Imager, insert into your Pi. **~10 minutes**.
3. **First boot** — plug in the Pi, wait 2–3 minutes for it to come up. **Don't click "Edit Settings" in Imager** — the image is pre-configured.
4. **Open the editor from your browser** — `http://home-screens.local:3000/editor` (pre-built image) or `http://<pi-ip>:3000/editor` (install script). Drag a clock onto the canvas, save. **~5 minutes**.

[**Start here → Installation guide**](/docs/getting-started)

---

## What to buy

If you're buying fresh, you'll want:

| Item | Notes | Approx. cost |
|---|---|---|
| **Raspberry Pi 5 (4 GB)** | Pi 4 also works; Pi 5 is noticeably smoother with animations and larger displays | $60 |
| **Official 27 W USB-C power supply** | Pi 5 needs this — generic phone chargers don't deliver enough power | $12 |
| **SanDisk Ultra 32 GB A1 microSD** | Any 16 GB+ A1-class card works | $8 |
| **Micro-HDMI-to-HDMI cable** | **Pi 5 uses micro-HDMI**, not full-size — your old cable won't fit | $8 |
| **HDMI display** | Any TV or monitor works. A portrait-oriented 1080×1920 panel is ideal for the default layout, but rotating any 1080p display vertically is fine. | varies |

Total: **~$90** plus a display. Budget tip: a repurposed old monitor or a small TV works great for a kitchen wall.

---

## Privacy & safety

- **All your data stays on your Pi.** No cloud accounts, no database, no required servers.
- **The pre-built image has a default username and SSH password** (`hs` / `screens`). Change it with `passwd` on first login, or leave SSH disabled if you don't need shell access.
- **You can always roll back.** Every upgrade keeps the previous version on disk for instant rollback from Settings > System.

---

## Key features

- **39 modules** — clock, weather, calendar, news, stocks, sports, chore chart, meal planner, photos, and more
- **Visual drag-and-drop editor** — no JSON required
- **9 weather providers** — Open-Meteo works zero-config worldwide; NOAA (US), Yr.no (global), SMHI (Nordic), Met Office (UK), and Environment Canada (Canada) are also free with no key; OpenWeatherMap, WeatherAPI, and Pirate Weather round out the key-required options
- **Google Calendar + iCal** — two paths to Google (iCal URL or OAuth); iCal also works with Apple, Outlook, Fastmail, and anything else that publishes ICS
- **Profile system** — different screens at different times of day (morning vs. evening, weekdays vs. weekends)
- **Multi-display** — one server, many Pis, each with its own layout

Built with Next.js 16, React 19, and Tailwind CSS. Configuration is a single JSON file — no database.

---

## Getting help

- [GitHub Issues](https://github.com/home-screens/home-screens/issues) — report bugs or request features
- [GitHub Discussions](https://github.com/home-screens/home-screens/discussions) — ask questions and share your setup
- [Releases](https://github.com/home-screens/home-screens/releases) — check for the latest version
- [FAQ](/docs/faq) — common questions and failure modes

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/getting-started" description="Step-by-step guide to getting Home Screens up and running." /%}

{% quick-link title="Editor Guide" icon="plugins" href="/docs/editor" description="Design your screens with drag-and-drop." /%}

{% quick-link title="Modules" icon="presets" href="/docs/modules" description="Tour all 39 built-in modules." /%}

{% quick-link title="FAQ" icon="theming" href="/docs/faq" description="Common questions and troubleshooting." /%}

{% /quick-links %}
