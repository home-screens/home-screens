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

Home Screens ships with **anonymous telemetry on by default**. It sends one message per 24 hours, and this is the whole of it:

- An anonymous install ID (a random UUID, not tied to you or any account)
- App version and platform (operating system and processor type)
- Display resolution and orientation, plus the same for each display if you run more than one
- How many displays, screens, modules, and profiles you have
- Which module types are in use (e.g. clock, weather), as counts
- Which weather provider and screen transition effect you picked
- Whether sleep, alerts, and a password are switched on --- the on/off setting only, never the password itself
- Whether a calendar is connected (Google or an iCal feed), but never anything in it
- Installed plugins (marketplace names and versions; plugins from outside the marketplace are counted but never named)

The report itself carries no location and no network address, and it never contains your calendar events, notes, photos, file names, display names, or API keys. Sending it does reveal where the request came from to the server that receives it, the same as any website you visit.

Disable it at any time in **Settings > Status > Anonymous Telemetry** --- the same list is shown there, so you can always check it against this page. Everything else --- your config, meals, chores, photos, calendars --- stays on your Pi.

### How do I give my kids access to check off chores?

Home Screens has a separate kid-friendly view at `/chores`. It is **not password-protected**, even when you have set a password for the editor: anyone on your home network who opens that address can use it. That is deliberate, so a kid never has to log in, and it is worth knowing before you open your network up to guests.

Bookmark `http://<your-pi>:3000/chores` on a kid's tablet or old phone. They can check off today's chores and spend the tickets they have earned. They cannot add or change chores, adjust anyone's ticket balance, change settings, or check off a chore for an earlier day. Everything they cannot do lives on the `/remote` page, which does ask for the password once you have set one. (Pre-built-image users can use `http://home-screens.local:3000/chores`; install-script users should use their Pi's hostname or IP.)

### What hardware do I need?

- A **Raspberry Pi 4 or 5** (2 GB+ RAM recommended)
- Any **HDMI display** (a thrift store monitor or repurposed TV works great)
- A network connection (Ethernet or Wi-Fi)

That's it. See the [Raspberry Pi guide](/docs/raspberry-pi) for full setup instructions.

### Can I run it without a Raspberry Pi?

Yes. Home Screens runs on any machine with **Node.js 22+**. You can run it on a laptop, desktop, NUC, or any Linux/macOS/Windows server. The Raspberry Pi is just the most common deployment target for a dedicated wall display.

### What display orientation is supported?

The default is **portrait at 1080x1920**, which works well for wall-mounted displays. During installation, you can choose from portrait, landscape, inverted, or counter-clockwise portrait.

The editor's **Settings > Screen** page sets the size of the canvas your modules are laid out on. Match it to your physical screen so everything lines up. It does not change the signal the Pi sends to the monitor --- that is picked during installation and stored in `data/kiosk.conf`, so setting 3840x2160 in the editor on a 1080p screen gives you a squashed layout, not a 4K picture.

---

## Setup

### How do I update to the latest version?

Go to **Settings > System & updates > Check for Updates** in the editor and click **Upgrade**. The upgrade downloads a pre-built release from GitHub, swaps the application directory, and restarts the service. No build step is needed on the Pi.

You can also drive it from the command line — see [Upgrade and rollback via API](/docs/raspberry-pi#upgrade-and-rollback-via-api).

### How do I rollback after a bad update?

Go to **Settings > System & updates > Rollback** in the editor and pick the version you want.

Rolling back downloads the version you picked from GitHub and installs it the same way an upgrade does, so it needs an internet connection and takes about as long as an upgrade. Your configuration is copied to a backup file before every upgrade, so your settings come through the trip intact.

### How do I backup my configuration?

Go to **Settings > Backups & data > Full Backup** in the editor and click **Backup All Data**. This downloads a JSON file containing your screens, modules, settings, location, calendars, device preferences, and your chore and meal data. You can also back up from the [remote control](/docs/remote-control) by tapping the gear icon and choosing **Backup All Data**.

Your API keys and connected accounts are left out unless you ask for them. Tick **Include my API keys and connected accounts** to add them, and **Protect them with a password** to lock them inside the file. You'll need an editor password set up first (Settings > Security). See [Backing up your keys](/docs/configuration#backing-up-your-keys) for what that covers and what happens if you forget the password.

A configurable backup reminder will notify you when you haven't backed up recently (configurable in Settings > Backups & data).

You can also use the **Share Layout** option to export just the visual layout (screens and modules) without personal data like API keys or location, which is safe to share with others.

### How do I restore a backup?

Go to **Settings > Backups & data > Full Backup** in the editor and click **Restore Backup**. Select a backup file you saved earlier. (Don't confuse this with **Import Layout** in the Share Layout card, which only brings in screens and modules.) Your configuration will be replaced with the contents of the backup. Restore is also available from the remote control's Settings sheet.

If the backup has a password on its keys, you'll be asked for it. If you can't remember it, choose **Restore without my keys** and everything else still comes back.

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

Yes, two ways. [Plugins](/docs/plugins) add modules at runtime without touching the core — that's the usual route. If you're forking Home Screens and want a module built in, the [Development Guide](/docs/development#adding-a-new-module) walks through the registry pattern with code.

### Why isn't my weather, calendar, or stocks data updating?

The most common cause is a missing location or a missing key. Check the following:

1. For weather, open the editor and go to **Settings > Weather**. Each provider has its own card there, with its key field inside. Then check **Settings > Location & language** --- without a location there is nothing to forecast. Stocks and news need no key at all.
2. For services that do use a key (Immich, Todoist, traffic, Google Maps), go to **Settings > API keys** and check the key is entered and correct
3. For calendars, check **Settings > Calendar**. If you're using an iCal feed, confirm the URL loads in a browser (most providers allow anonymous fetch). If you're using Google or an iCloud account, confirm the sign-in has been completed. See [Calendar setup](/docs/getting-started#calendar-setup) for all the options.
4. Check the browser console or server logs for error messages

Some modules also have a refresh interval --- data won't update more frequently than the configured interval.

### Which weather provider should I choose?

Regional providers (NOAA, Yr.no, SMHI, Met Office, Environment Canada) are usually the most accurate option within the area they cover. Of those, only Met Office asks you to sign up for a key. For global coverage with no signup at all, use **Open-Meteo**, which is what a fresh install starts on. For the most features (air quality, UV index, minute-by-minute precipitation), go with **OpenWeatherMap** or **Pirate Weather**.

All {% $stats.weatherProviderCount %} providers, their coverage, and which ones need a key are listed in [Weather providers](/docs/getting-started#weather-providers-settings-weather).

Whichever provider you pick, set your location first at **Settings > Location & language** --- a new install has no location yet, so the weather module has nothing to look up until you do.

### What photo sources are supported?

Home Screens supports four photo sources for the **Photo Slideshow** and **Full-Screen Photo Viewer** modules:

- **Local** — photos uploaded to `public/backgrounds/` or a subdirectory, managed through the editor or API
- **[Immich](https://immich.app)** — a self-hosted Google Photos alternative; browse and display photos from your Immich library with album, person (face recognition), and favorites filtering
- **iCloud shared album** — paste a public shared album link from Apple Photos; no account or API key needed
- **OneDrive** — photos straight from a folder and its subfolders in your personal OneDrive, after a one-time Microsoft sign-in (see [OneDrive photos](/docs/modules#one-drive-photos))

For **background rotation**, four sources are available: **Unsplash** (HD stock photos), **NASA APOD** (Astronomy Picture of the Day), **Immich**, and **iCloud shared albums**.

To use Immich, enter your server URL and API key in **Settings > API keys**. The API key is generated from Immich's Account Settings → API Keys page. To use OneDrive, save the **Application (client) ID** from a free Microsoft app registration and sign in once from the module — the steps are in [OneDrive photos](/docs/modules#one-drive-photos). iCloud shared albums need no setup — just a shared album link with the public website option enabled.

---

## Display

### How do I hide the mouse cursor?

The cursor hides automatically. Home Screens has a **Cursor Auto-Hide** feature (configurable in **Settings > Screen**) that hides the cursor after a few seconds of inactivity. Move the mouse to bring it back. This works in both kiosk mode and regular browser windows.

### How do I prevent screen burn-in?

Several built-in features help prevent burn-in:

- **Screen rotation** --- cycle through multiple screens at a set interval so no single layout stays on screen indefinitely
- **Sleep schedule** --- configure hours when the display is fully blanked (e.g., overnight) at **Settings > Screen > Sleep & dimming**
- **Dim schedule** --- reduce brightness during certain hours without fully blanking the screen
- **Screensaver** --- while the display is dimmed, before it fully sleeps, a minimal clock can drift slowly around the screen so nothing sits in one place. Once the display is fully asleep the screen is blank, which protects it even better
- **Background rotation** --- automatically cycle background images from Unsplash, NASA, Immich, or an iCloud shared album to vary what's on screen

### Can I control the display remotely?

Yes, three ways: the phone [remote](/docs/remote-control) at `/remote`, a **Display Control** module placed on a touchscreen, or the `/api/display/*` endpoints from any script or home-automation system.

The endpoints cover wake, sleep, brightness, next/previous screen, profile switching, and pushing alerts. See [Display Control](/docs/api#display-control) in the API reference for the full list, and [Remote display control](/docs/networking#remote-display-control) for the auth and Home Assistant setup.

### How do I use profiles for different times of day?

Profiles let you show different sets of screens based on a schedule:

1. Go to **Settings > Automation > Profiles** and click **Add Profile**
2. Give it a name (e.g., "Morning", "Work Hours", "Evening")
3. Select which screens to include
4. Set the days of the week and a time window (e.g., Monday--Friday, 6:00--9:00)

The display will automatically switch to the matching profile at the scheduled time. You can also activate profiles manually from the settings or via the API. See the [Editor Guide](/docs/editor#profiles) for more details.

---

## Development

### How do I contribute?

Home Screens is open source and welcomes contributions. Visit the [GitHub repository](https://github.com/home-screens/home-screens) to file issues, suggest features, or submit pull requests.
