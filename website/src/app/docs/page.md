---
title: Getting started
nextjs:
  metadata:
    title: Documentation
    description: Documentation for Home Screens — a free, open-source smart display for Raspberry Pi. A self-hosted alternative to MagicMirror and Dakboard with a visual editor.
    alternates:
      canonical: /docs
---

A free, open-source smart display for your kitchen, hallway, or family command center. Runs on a Raspberry Pi, configured from your phone, with {% $stats.moduleCount %} built-in modules. **About 30 minutes from unboxing to first screen.** {% .lead %}

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

- **Your content stays on your Pi.** Your screens, photos, calendars, chores, and API keys live in files on the device. No cloud accounts, no database, no required servers.
- **One anonymous usage report a day.** Home Screens sends its version, platform, and how many screens and modules you have. Never your calendar events, photos, notes, or API keys, and nothing with your name on it. The report itself carries no location and no network address, though the server that receives it can see where the request came from, the same as any website you visit. Turn it off in Settings > Status, or read exactly what it sends in the [FAQ](/docs/faq#does-home-screens-collect-any-data).
- **The editor has no password until you set one.** Anyone on your home network can open it and change your screens. Set a password in Settings > Security; it covers the editor and the phone remote, and the kids' chore view stays open on purpose.
- **The pre-built image turns SSH on at first boot** with the username `hs` and the password `screens`. Change the password right away with `passwd`, or switch SSH off entirely with `sudo systemctl disable --now ssh` if you don't need it.
- **You can always roll back.** Settings > System & updates lists every published version; pick an older one and Home Screens re-installs it, which needs an internet connection. If an upgrade fails its health check, the previous version is put back automatically.

---

## Getting help

- [GitHub Issues](https://github.com/home-screens/home-screens/issues) — report bugs, request features, or ask a question
- [Releases](https://github.com/home-screens/home-screens/releases) — check for the latest version
- [FAQ](/docs/faq) — common questions and failure modes

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/getting-started" description="Step-by-step guide to getting Home Screens up and running." /%}

{% quick-link title="Editor Guide" icon="plugins" href="/docs/editor" description="Design your screens with drag-and-drop." /%}

{% quick-link title="Modules" icon="presets" href="/docs/modules" description="Tour all built-in modules." /%}

{% quick-link title="FAQ" icon="theming" href="/docs/faq" description="Common questions and troubleshooting." /%}

{% /quick-links %}
