---
title: FAQ
nextjs:
  metadata:
    title: Frequently Asked Questions
    description: Common questions about Home Screens — hardware requirements, Raspberry Pi setup, customization, MagicMirror comparison, and more.
    alternates:
      canonical: /docs/faq
---

## General

### What is Home Screens?

Home Screens is an open-source smart display system that turns a Raspberry Pi and any HDMI monitor into a customizable information dashboard. It replaces commercial products like Dakboard and MagicMirror with a self-hosted, web-based solution featuring a drag-and-drop editor, {% $stats.moduleCount %} built-in modules, and a fullscreen kiosk mode.

### Is it free?

Yes. Home Screens is free and open source under the MIT license. There are no subscriptions, no cloud accounts, and no usage limits. It will always be free.

### Does Home Screens collect any data?

Home Screens ships with **anonymous telemetry on by default**. It sends one beacon per 24 hours containing:

- A random install ID (not tied to you, no account)
- App version and update channel
- Platform (e.g. "linux-arm64")
- How many displays, screens, and modules you have (counts only, no content)
- Which module types and plugins are installed (names, no settings)

It does **not** send your calendar events, photos, API keys, IP address, or any content you've configured. Disable it at any time in **Settings > Stats > Anonymous Telemetry**. All other data — your config, meals, chores, photos, calendars — stays on your Pi.

### How do I give my kids access to check off chores?

Home Screens has a separate kid-friendly view at `/chores` that is **not password-protected**, even when the editor requires a password. Bookmark `http://<your-pi>:3000/chores` on a kid's tablet or old phone — they can mark today's chores complete and see their rewards, but can't change settings, backdate, or manage anything. The admin-only chore management lives at `/remote`. (Pre-built-image users can use `http://home-screens.local:3000/chores`; install-script users should use their Pi's hostname or IP.)

### What hardware do I need?

- A **Raspberry Pi 4 or 5** (2 GB+ RAM recommended)
- Any **HDMI display** (a thrift store monitor or repurposed TV works great)
- A network connection (Ethernet or Wi-Fi)

That's it. See the [Raspberry Pi guide](/docs/raspberry-pi) for full setup instructions.

### Can I run it without a Raspberry Pi?

Yes. Home Screens runs on any machine with **Node.js 22+**. You can run it on a laptop, desktop, NUC, or any Linux/macOS/Windows server. The Raspberry Pi is just the most common deployment target for a dedicated wall display.

### What display orientation is supported?

The default is **portrait at 1080x1920**, which works well for wall-mounted displays. During installation, you can choose from portrait, landscape, inverted, or counter-clockwise portrait. The resolution is also configurable --- you can set any custom resolution through the editor at **Settings > Display**.

---

## Setup

### How do I update to the latest version?

Go to **Settings > System > Check for Updates** in the editor and click **Upgrade**. The upgrade downloads a pre-built release from GitHub, swaps the application directory, and restarts the service. No build step is needed on the Pi.

{% callout type="note" %}
From the command line: `curl -X POST http://localhost:3000/api/system/upgrade`.
{% /callout %}

### How do I rollback after a bad update?

If something goes wrong after an upgrade:

1. **From the editor** --- go to **Settings > System > Rollback** to revert to the previous version.
2. **From the command line**:
   ```bash
   curl -X POST http://localhost:3000/api/system/rollback
   ```

Home Screens keeps the previous version on disk so rollbacks are instant.

### How do I backup my configuration?

Go to **Settings > Data > Full Backup** in the editor and click **Export**. This downloads a JSON file containing your entire configuration --- screens, modules, settings, location, calendars, and device preferences. You can also back up from the [remote control](/docs/remote-control) by tapping the gear icon and choosing **Backup All Data**.

A configurable backup reminder will notify you when you haven't backed up recently (configurable in Settings > Data).

You can also use the **Share Layout** option to export just the visual layout (screens and modules) without personal data like API keys or location, which is safe to share with others.

### How do I restore a backup?

Go to **Settings > Data > Full Backup** in the editor and click **Import**. Select a previously exported JSON backup file. Your configuration will be replaced with the contents of the backup. Restore is also available from the remote control's Settings sheet.

### How do I reset to factory defaults?

Delete (or rename) the `data/config.json` file and restart the server. Home Screens will regenerate a fresh default configuration on startup.

```bash
# On a Raspberry Pi
sudo systemctl stop home-screens
mv /opt/home-screens/current/data/config.json /opt/home-screens/current/data/config.json.bak
sudo systemctl start home-screens
```

### Can I run multiple displays from one server?

Yes. Home Screens supports a hub-and-spoke deployment where one Next.js server (the hub) drives any number of Raspberry Pi displays (the spokes), each with its own screens, layout, dimensions, rotation, and active profile. Spoke Pis run only Chromium and the kiosk launcher — no Node.js — and are installed with `~/home-screens/scripts/install.sh --display-only --backend http://<hub>:3000`. After install, the spoke appears in the editor's **Settings > Per display > All displays** page under **Unadopted Displays** and you click **Adopt** to register it. See the [Multi-display guide](/docs/multi-display) for the full setup.

### How do I change the port?

Most users don't need to. Home Screens runs on port 3000 and is accessed at `http://<your-pi>:3000/editor` (or `http://home-screens.local:3000/editor` if you used the pre-built image). If port 3000 is already taken on your network, pass `--port 8080` when running the installer, or see [Advanced Networking](/docs/networking#custom-port-configuration) for other options.

---

## First-boot problems

### I flashed the SD card but the screen is still black after 5 minutes

A few things to check:

1. **HDMI cable** — Pi 5 uses **micro-HDMI**, not full-size. A regular HDMI cable won't fit. Try a micro-HDMI-to-HDMI adapter or cable.
2. **Power supply** — Pi 5 needs a 27 W USB-C PSU. Cheaper phone chargers cause under-voltage warnings and may not boot.
3. **SD card** — try re-flashing with a fresh copy of the image. A bad write is common with cheap or old cards.
4. **Wait longer** — on a slow SD card, first boot can take up to 5 minutes. If you see the rainbow splash but then it goes black, it's probably still working.

### WiFi didn't connect on first boot

If you used `wifi.txt` but the Pi never came online:

1. Re-insert the SD card in your computer. Is `wifi.txt` still there (not deleted)? If so, the Pi never read it — check the filename (it needs to be exactly `wifi.txt`, not `wifi.txt.txt`, a common Windows trap).
2. Double-check the `SSID=` and `PASSWORD=` lines for typos. Passwords with special characters should not be quoted.
3. **Try Ethernet as a fallback** — plug in a network cable, boot, then configure WiFi from the editor's **Settings > Network** page.

### I can't find my Pi on the network

If you used the **pre-built image**, the hostname is baked in as `home-screens`:

```bash
ping home-screens.local
```

If you used the **install script**, the Pi keeps whatever hostname Raspberry Pi OS was set up with (usually `raspberrypi`, or whatever you entered in Imager's advanced options):

```bash
ping raspberrypi.local
```

If mDNS doesn't resolve at all (some ISP routers disable it), check your router's admin page for the device and use its IP directly: `http://<pi-ip>:3000/editor`.

### The screen is rotated the wrong way

Go to **Settings > Display > Rotation** in the editor, or see [Troubleshooting > Screen rotation issues](/docs/troubleshooting#screen-rotation-issues) for the command-line fix.

---

## Modules

### How many modules can I add to a screen?

There is no hard limit. In practice, performance depends on your hardware. A Raspberry Pi 4 with 2 GB RAM handles 10--15 modules per screen comfortably. More powerful hardware can handle more. If you notice sluggishness, try reducing the number of modules that make frequent API calls (weather, stocks, news).

### Does it work with Home Assistant?

Yes. Home Screens ships an official **Home Assistant plugin** that displays your HA entities directly on the wall. It supports lights, climate, media players, covers, locks, sensors, switches, and more — auto-rendered as type-aware cards (gauges for sensors, dials for thermostats, toggles for switches), not rows in a table. You can also interact with entities: tap a light to toggle it, nudge a thermostat, play/pause media, lock a door — all from the display.

To set it up:

1. In Home Assistant, go to **Profile > Security > Long-Lived Access Tokens** and create a token (valid for 10 years).
2. In the Home Screens editor, open the plugin browser, install **Home Assistant**, and paste your HA URL and the token in the plugin's settings.
3. Pick the entities or area you want to show — no Jinja2 templates, no YAML, no manual icon mapping.

The plugin runs every request through Home Screens' server-side proxy, so your token never reaches the browser. See the [Plugins reference](/docs/plugins) for how plugins, secrets, and the LAN proxy work.

If you want HA to drive the *display itself* (wake/sleep, switch screens, push alerts), the [remote-control API](/docs/remote-control#home-assistant-integration) works the other direction — HA calls Home Screens via RESTful Command.

### Can I create custom modules?

Yes. Home Screens uses a module registry pattern. To add a new module, you create a React component, register it in the module registry, and add its configuration to the property panel. See the [Development Guide](/docs/development) for a walkthrough of the full process.

### Why isn't my weather, calendar, or stocks data updating?

The most common cause is a missing or invalid API key. Check the following:

1. Open the editor and go to **Settings > Integrations**
2. Verify that the relevant API key is entered and correct
3. For calendars, check **Settings > Calendar**. If you're using an iCal feed, confirm the URL loads in a browser (most providers allow anonymous fetch). If you're using Google OAuth, confirm the sign-in flow has been completed. See [Calendar setup](/docs/getting-started#calendar-setup) for the two options.
4. Check the browser console or server logs for error messages

Some modules also have a refresh interval --- data won't update more frequently than the configured interval.

### Which weather provider should I choose?

Home Screens supports {% $stats.weatherProviderCount %} weather providers. Here's a comparison:

| Provider | API Key Required | Cost | Coverage | Features |
|---|---|---|---|---|
| **Open-Meteo** | No | Free | Global | Good general-purpose option, no signup needed |
| **NOAA** | No | Free | US only | Reliable for US locations, no signup needed |
| **Yr.no** | No | Free | Global | Norwegian Meteorological Institute, high-quality global forecasts |
| **SMHI** | No | Free | Nordic | Swedish Meteorological and Hydrological Institute, Nordic coverage |
| **Met Office** | No | Free | UK | UK Met Office DataHub, UK coverage |
| **Environment Canada** | No | Free | Canada | Official ECCC citypage feeds for Canadian cities |
| **OpenWeatherMap** | Yes | Free tier available | Global | Most popular, includes air quality and UV data |
| **WeatherAPI** | Yes | Free tier available | Global | Good accuracy, generous free tier |
| **Pirate Weather** | Yes | Free tier available | Global | Dark Sky replacement, includes minutely precipitation and alerts |

Regional free providers (NOAA, Yr.no, SMHI, Met Office, Environment Canada) are usually the highest-accuracy option within their coverage area. For zero-setup global coverage, use **Open-Meteo**. For the most features (air quality, UV index, minute-by-minute precipitation), go with **OpenWeatherMap** or **Pirate Weather**.

### What photo sources are supported?

Home Screens supports three photo sources for the **Photo Slideshow** and **Full-Screen Photo Viewer** modules:

- **Local** — photos uploaded to `public/backgrounds/` or a subdirectory, managed through the editor or API
- **[Immich](https://immich.app)** — a self-hosted Google Photos alternative; browse and display photos from your Immich library with album, person (face recognition), and favorites filtering
- **iCloud shared album** — paste a public shared album link from Apple Photos; no account or API key needed

For **background rotation**, four sources are available: **Unsplash** (HD stock photos), **NASA APOD** (Astronomy Picture of the Day), **Immich**, and **iCloud shared albums**.

To use Immich, enter your server URL and API key in **Settings > Integrations**. The API key is generated from Immich's Account Settings → API Keys page. iCloud shared albums need no setup — just a shared album link with the public website option enabled.

---

## Display

### How do I hide the mouse cursor?

The cursor hides automatically. Home Screens has a **Cursor Auto-Hide** feature (configurable in **Settings > Display**) that hides the cursor after a few seconds of inactivity. Move the mouse to bring it back. This works in both kiosk mode and regular browser windows.

### How do I prevent screen burn-in?

Several built-in features help prevent burn-in:

- **Screen rotation** --- cycle through multiple screens at a set interval so no single layout stays on screen indefinitely
- **Sleep schedule** --- configure hours when the display is fully blanked (e.g., overnight) at **Settings > Sleep**
- **Dim schedule** --- reduce brightness during certain hours without fully blanking the screen
- **Screensaver** --- during sleep, a minimal clock can be shown that moves position to avoid static pixels
- **Background rotation** --- automatically cycle background images from Unsplash, NASA, Immich, or an iCloud shared album to vary what's on screen

### Can I control the display remotely?

Yes. The `/api/display` endpoints let you control the display from any device on your network:

- **Wake/Sleep** --- `POST /api/display/wake` and `POST /api/display/sleep`
- **Brightness** --- `POST /api/display/brightness` with a value from 0 to 100
- **Navigation** --- `POST /api/display/next-screen` and `POST /api/display/prev-screen` to step through screens
- **Profiles** --- `POST /api/display/profile` to activate a named profile
- **Alerts** --- `POST /api/display/alert` to push a notification to the screen

See the [API Reference](/docs/api) for full endpoint documentation.

### How do I use profiles for different times of day?

Profiles let you show different sets of screens based on a schedule:

1. Go to **Settings > Profiles** and click **Add Profile**
2. Give it a name (e.g., "Morning", "Work Hours", "Evening")
3. Select which screens to include
4. Set the days of the week and a time window (e.g., Monday--Friday, 6:00--9:00)

The display will automatically switch to the matching profile at the scheduled time. You can also activate profiles manually from the settings or via the API. See the [Editor Guide](/docs/editor#profiles) for more details.

---

## Development

### How do I add a new module?

Adding a module involves several steps:

1. Create a React component in `src/components/modules/`
2. Add a type to the `ModuleType` union in `src/types/config.ts`
3. Define a config interface in `src/types/config.ts`
4. Set default dimensions in `src/lib/constants.ts`
5. Register it in `src/lib/module-registry.ts`
6. Add a dynamic import in `src/lib/module-components.ts`
7. Add editor configuration in `src/components/editor/PropertyPanel.tsx`
8. Optionally add an API route in `src/app/api/`

See the [Development Guide](/docs/development) for a detailed walkthrough.

### How do I contribute?

Home Screens is open source and welcomes contributions. Visit the [GitHub repository](https://github.com/home-screens/home-screens) to file issues, suggest features, or submit pull requests.
