---
title: FAQ
nextjs:
  metadata:
    title: Frequently Asked Questions
    description: Common questions about Home Screens — hardware requirements, Raspberry Pi setup, customization, MagicMirror comparison, and more.
---

## General

### What is Home Screens?

Home Screens is an open-source smart display system that turns a Raspberry Pi and any HDMI monitor into a customizable information dashboard. It replaces commercial products like Dakboard and MagicMirror with a self-hosted, web-based solution featuring a drag-and-drop editor, 34 widget modules, and a fullscreen kiosk mode.

### Is it free?

Yes. Home Screens is free and open source under the MIT license. There are no subscriptions, no cloud accounts, and no usage limits. It will always be free.

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

There are two ways:

1. **From the editor** --- go to **Settings > System > Check for Updates** and click upgrade.
2. **From the command line** --- send a POST request:
   ```bash
   curl -X POST http://localhost:3000/api/system/upgrade
   ```

The upgrade downloads a pre-built release from GitHub, swaps the application directory, and restarts the service. No build step is needed on the Pi.

### How do I rollback after a bad update?

If something goes wrong after an upgrade:

1. **From the editor** --- go to **Settings > System > Rollback** to revert to the previous version.
2. **From the command line**:
   ```bash
   curl -X POST http://localhost:3000/api/system/rollback
   ```

Home Screens keeps the previous version on disk so rollbacks are instant.

### How do I backup my configuration?

Go to **Settings > Data > Full Backup** in the editor and click **Export**. This downloads a JSON file containing your entire configuration --- screens, modules, settings, location, calendars, and device preferences.

You can also use the **Share Layout** option to export just the visual layout (screens and modules) without personal data like API keys or location, which is safe to share with others.

### How do I restore a backup?

Go to **Settings > Data > Full Backup** in the editor and click **Import**. Select a previously exported JSON backup file. Your configuration will be replaced with the contents of the backup.

### How do I reset to factory defaults?

Delete (or rename) the `data/config.json` file and restart the server. Home Screens will regenerate a fresh default configuration on startup.

```bash
# On a Raspberry Pi
sudo systemctl stop home-screens
mv /opt/home-screens/data/config.json /opt/home-screens/data/config.json.bak
sudo systemctl start home-screens
```

### Can I run multiple displays from one server?

Yes. The display view at `/display` is a standard web page, so multiple browsers can load it simultaneously. All displays will show the same configuration and rotate through the same screens.

If you want different content on different displays, run separate Home Screens instances on different ports.

### How do I change the port?

If you used the install script, pass the `--port` flag:

```bash
~/home-screens/scripts/install.sh --port 8080
```

For manual setups, set the port when starting the server:

```bash
PORT=8080 npm run start
```

---

## Modules

### How many modules can I add to a screen?

There is no hard limit. In practice, performance depends on your hardware. A Raspberry Pi 4 with 2 GB RAM handles 10--15 modules per screen comfortably. More powerful hardware can handle more. If you notice sluggishness, try reducing the number of modules that make frequent API calls (weather, stocks, news).

### Can I create custom modules?

Yes. Home Screens uses a module registry pattern. To add a new module, you create a React component, register it in the module registry, and add its configuration to the property panel. See the [Development Guide](/docs/development) for a walkthrough of the full process.

### Why isn't my weather, calendar, or stocks data updating?

The most common cause is a missing or invalid API key. Check the following:

1. Open the editor and go to **Settings > Integrations**
2. Verify that the relevant API key is entered and correct
3. For Google Calendar, make sure you've completed the OAuth sign-in flow at **Settings > Calendar**
4. Check the browser console or server logs for error messages

Some modules also have a refresh interval --- data won't update more frequently than the configured interval.

### Which weather provider should I choose?

Home Screens supports five weather providers. Here's a comparison:

| Provider | API Key Required | Cost | Coverage | Features |
|---|---|---|---|---|
| **Open-Meteo** | No | Free | Global | Good general-purpose option, no signup needed |
| **NOAA** | No | Free | US only | Reliable for US locations, no signup needed |
| **OpenWeatherMap** | Yes | Free tier available | Global | Most popular, includes air quality and UV data |
| **WeatherAPI** | Yes | Free tier available | Global | Good accuracy, generous free tier |
| **Pirate Weather** | Yes | Free tier available | Global | Dark Sky replacement, includes minutely precipitation and alerts |

If you're in the US and want zero setup, **NOAA** is the easiest choice. For global coverage without an API key, use **Open-Meteo**. If you want the most features (air quality, UV index, minute-by-minute precipitation), go with **OpenWeatherMap** or **Pirate Weather**.

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
- **Unsplash background rotation** --- automatically cycle background images to vary what's on screen

### Can I control the display remotely?

Yes. The `/api/display` endpoints let you control the display from any device on your network:

- **Wake/Sleep** --- `POST /api/display/wake` and `POST /api/display/sleep`
- **Brightness** --- `POST /api/display/brightness` with a value from 0 to 100
- **Navigation** --- `POST /api/display/navigate` to jump to a specific screen
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
