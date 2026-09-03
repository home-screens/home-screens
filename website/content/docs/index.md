---
title: Overview
nextjs:
  metadata:
    title: Documentation
    description: Documentation for Home Screens, a free, open-source smart display for Raspberry Pi. A self-hosted alternative to MagicMirror and Dakboard with a visual editor.
    alternates:
      canonical: /docs
---

A free, open-source smart display for your kitchen, hallway, or family command center. Runs on a Raspberry Pi, set up from your laptop, used from your phone, with {% $stats.moduleCount %} built-in modules. **About 10 minutes of hands-on work, and around 30 minutes from unboxing to first screen.** {% .lead %}

{% quick-links %}

{% quick-link title="Install" icon="installation" href="/docs/getting-started" description="Flash the card, plug in the Pi, find it on your network." /%}

{% quick-link title="Your first screen" icon="presets" href="/docs/first-screen" description="Pick a template, set your location, add a calendar and a chore chart." /%}

{% quick-link title="On your phone" icon="phone" href="/docs/remote-control" description="The family remote for parents and the chores page for kids." /%}

{% quick-link title="Troubleshooting" icon="help" href="/docs/troubleshooting" description="Black screen, weather not loading, calendar not syncing, and more." /%}

{% /quick-links %}

## Your weekend project

1. **Get the hardware.** About $90 if you are starting from scratch, less if you already have a screen. See [What to buy](/docs/what-to-buy).
2. **Flash the card.** Download the ready-to-boot image and write it with Raspberry Pi Imager. About 10 minutes, most of it waiting for the download. See [Install](/docs/getting-started).
3. **Plug in the Pi.** The screen shows the address to open, and a QR code, as soon as it has booted.
4. **Open the editor on a laptop** and pick a template. Set your location and the weather fills in. There is no Save button; every change goes live on the wall a second after you make it. See [Your first screen](/docs/first-screen).
5. **Hand it to the family.** Settings > On your phone shows two addresses: the family remote for grown-ups, and a chores page for kids. See [On your phone](/docs/remote-control).

## The words you will see

- **Display**: a physical screen with a Pi behind it. Most homes have one; you can add more later.
- **Screen**: one layout. A display cycles through its screens in turn.
- **Rotation**: that cycling from one screen to the next. How long each screen stays up is set under Settings > Screen.
- **Orientation**: whether the picture is portrait or landscape. Also under Settings > Screen.
- **Module**: one thing on a screen. A clock, a weather forecast, a chore chart, a photo slideshow.
- **Plugin**: an extra module you install from the Plugins button in the editor. Home Assistant, Garmin and Strava are plugins.
- **Family remote**: the phone page for grown-ups, at `/remote`. Chores, meals, timers, photos, and control of the wall.
- **Kid view**: the phone page for children, at `/chores`. Check off today's chores and spend tickets, nothing else.
- **Hub**: the Pi that runs Home Screens. It only comes up when you have more than one display; the others show what the hub serves.

## Privacy and safety

- **Your content stays on your Pi.** Your screens, photos, calendars, chores, and API keys live in files on the device. No cloud accounts, no database, no required servers.
- **One anonymous usage report a day.** Home Screens sends its version, platform, and how many screens and modules you have. Never your calendar events, photos, notes, or API keys, and nothing with your name on it. The report itself carries no location and no network address, though the server that receives it can see where the request came from, the same as any website you visit. Turn it off in Settings > Status, or read exactly what it sends in the [FAQ](/docs/faq#does-home-screens-collect-any-data).
- **The editor has no password until you set one.** Anyone on your home network can open it and change your screens. Set a password in Settings > Security; it covers the editor and the family remote, and the kids' chores page stays open on purpose.
- **You can always roll back.** Settings > System & updates lists every published version; pick an older one and Home Screens re-installs it, which needs an internet connection. If an update fails its health check, the previous version is put back automatically.

## Getting help

- [Troubleshooting](/docs/troubleshooting) and the [FAQ](/docs/faq) cover the common questions
- [Discord](https://discord.gg/KafmFuSNU) for a quick answer from other users
- [GitHub Issues](https://github.com/home-screens/home-screens/issues) to report a bug or ask for a feature
- [Releases](https://github.com/home-screens/home-screens/releases) to see what is new
