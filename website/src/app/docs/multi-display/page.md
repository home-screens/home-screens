---
title: Multi-display
nextjs:
  metadata:
    title: Multi-display
    description: Run multiple Raspberry Pi displays from one Home Screens hub.
    alternates:
      canonical: /docs/multi-display
---

Home Screens supports a hub-and-spoke deployment where one Next.js server (the **hub**) drives up to 64 Raspberry Pi displays (the **spokes**). Each display owns its own screens, layout, dimensions, rotation, and active profile, all served from the single `data/config.json` on the hub. A portrait kitchen touchscreen and a landscape living-room TV can coexist on the same hub without either of them squashing the other's layout.

Multi-display support is **opt-in**. Existing single-display installs are completely unchanged — the legacy `/display` URL continues to render the global screens directly, and no UI element changes until you add a second display.

---

## How it works

```
                ┌─────────────────────────────┐
                │   Hub (Raspberry Pi or PC)  │
                │   /opt/home-screens         │
                │   data/config.json          │
                │   Next.js server :3000      │
                └────────────┬────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ Kitchen  │         │ Bedroom  │         │ Office   │
   │ Pi (Lite)│         │ Pi (Lite)│         │ Pi (Lite)│
   │ Chromium │         │ Chromium │         │ Chromium │
   │ /display/│         │ /display/│         │ /display/│
   │ kitchen  │         │ bedroom  │         │ office   │
   └──────────┘         └──────────┘         └──────────┘
```

The hub holds one config file. Each spoke is a Pi running Chromium in kiosk mode against `http://<hub>:3000/display/<id>`. Spokes have **no local Node.js, no app, no config** — just the kiosk browser. Editor changes on the hub are picked up by the spokes on the next reload or live config refresh.

| Term | Meaning |
|---|---|
| **Hub** | The machine running the Home Screens server. Holds `data/config.json` and serves the editor. |
| **Spoke** | A display-only Raspberry Pi running Chromium pointed at the hub. No Node.js. |
| **Display** | A registered entry in the hub's `displays` array. Has an ID (`kitchen`), name, screens, dimensions, rotation, and optional active profile. |
| **Adoption** | The flow that moves a powered-on but unregistered spoke from the "Unadopted Displays" list into the registered displays list. |

---

## Installing a spoke Pi

A spoke install skips Node.js and the release tarball entirely. It installs only Chromium, the labwc Wayland compositor, `wtype`, `wlr-randr`, and the kiosk launcher.

### Prerequisites

- A Raspberry Pi running [Raspberry Pi OS Lite 64-bit (Trixie)](https://www.raspberrypi.com/software/operating-systems/) (Desktop also supported with `--desktop`). In Raspberry Pi Imager, look under **Raspberry Pi OS (other)** to find the Lite image.
- Network access to the hub
- The hub URL (e.g. `http://192.168.1.100:3000`)

### Install command

```bash
sudo apt install git
git clone https://github.com/home-screens/home-screens.git
~/home-screens/scripts/install.sh --display-only --backend http://192.168.1.100:3000
```

| Flag | Description |
|---|---|
| `--display-only` | Skip Node.js, the app tarball, and the systemd service. Install only the kiosk packages and launcher. |
| `--backend <url>` | Required with `--display-only`. The hub URL the kiosk should point at. Trailing slashes are stripped. |
| `--display-id <id>` | Optional. The display ID this spoke will register under. Must be lowercase letters, digits, and hyphens, max 64 chars. If omitted, the installer auto-generates one from the hostname plus a 4-character random suffix (e.g. `home-screens-hysd`). |

The auto-generated suffix prevents two Pis with the same hostname (the Raspberry Pi OS default of `raspberrypi` is the classic case) from colliding on the same display ID.

After install, reboot the Pi. On boot it tries the hub immediately. If the hub answers, Chromium opens `http://<hub>:3000/display/<id>` directly. If the hub is unreachable, the launcher shows a local splash screen and starts a background watcher; the moment the hub answers, the watcher kills Chromium, the labwc autologin cycle restarts the launcher, and it exec's into the real display URL. No power cycle is needed.

---

## Adopting a spoke in the editor

When a freshly installed spoke first contacts the hub, it doesn't have a registered display yet. Instead it shows a "waiting for adoption" screen and polls `/api/displays` every five seconds. On the hub side, the spoke automatically appears in the editor's **Settings > Per display > All displays** page under **Unadopted Displays**, tagged with its IP address and self-reported viewport.

To adopt:

1. Open the editor on the hub: `http://<hub>:3000/editor`
2. Go to **Settings > Per display > All displays**
3. Find the spoke under **Unadopted Displays** — it will show its display ID, source IP, and current viewport (e.g. `1080×1920`)
4. Click **Adopt**
5. Give it a friendly name (e.g. "Kitchen", "Bedroom TV")
6. The dimensions and rotation pre-fill from the spoke's reported viewport. Adjust if needed.
7. Click **Save**

The display ID is locked at adoption time — it cannot be renamed later because the spoke continues using its original ID and would silently lose its connection. The friendly **name** can be changed freely.

Within a few seconds the spoke's polling picks up the adoption, navigates to `/display/<id>`, and starts rendering screens. New displays start with an empty screen list — design them by clicking the display to open its own page, then clicking **Edit screens** in the page header, which drops the editor canvas onto that display.

### Watching reporters

Each adopted display row shows:

- **Online dot** — green when the spoke has reported a heartbeat in the last few minutes, gray otherwise
- **Last seen** — relative timestamp (e.g. "Last seen 1s ago")
- **Source IP** — the network address the report came from (e.g. `from 192.168.86.187`)
- **Viewport** — post-rotation width and height as the spoke sees it

If two browser tabs at the same URL on the same Pi report under one display ID, they collapse into a single row with a `×2 tabs` badge. If two distinct IPs report under one display ID, they show as separate rows — a useful signal that you've accidentally pointed two Pis at the same display URL.

Heartbeats live only in the hub's memory, never in your config file, so that displays checking in every few seconds don't fight with the editor over the same file. Restart or upgrade the hub and every display shows offline, and anything waiting to be adopted disappears from the list, until each one checks in again a few seconds later. Nothing is lost.

---

## Designing screens for each display

Each display has its own independent screen list, designed at its own resolution. The editor surfaces this through two controls:

- The **Display Switcher** pill in the editor toolbar (hidden in single-display installs) shows the current display name and dimensions, and drops down to any registered display. Pick a display from the dropdown, and the canvas, property panel, and screen tabs all switch to that display's content. The pill answers "which canvas am I editing?" — it never changes a settings scope.
- The **Edit screens** shortcut on each display's detail page in **Settings > Per display** does the same thing in one click.

The canvas always renders at the active display's resolution and rotation, so a portrait kitchen touchscreen and a landscape living-room TV are designed at the right physical proportions side by side.

### Main display

When you add the first additional display to a single-display install, the editor automatically creates a `main` display from your existing global screens, profiles, and dimensions. (If instead your very first `addDisplay` call names the new display `main`, the globals migrate onto it directly — no sibling is seeded.) The legacy `/display` URL **renders the main display inline** — it resolves the target display server-side and renders the rotator directly with that `displayId`, without a redirect. (We avoid a redirect because Chromium `--app` mode duplicates its window when following a 307 with an RSC body.) When no display is named `main`, it falls back to the first display in the registry, so the existing kiosk keeps showing its current layout and active profile even if `main` was renamed or removed by hand. `main` is now a regular display node that owns its own resolution and rotation — you edit them on its **Per display > Main > Overrides** page like any other display. Removing `main` through the editor is hard-blocked at the store layer because it would orphan the hub's screens.

Second and later displays start with an empty screen list and an empty owned profile list, so you design fresh for the new resolution.

---

## Defaults vs Per display

The settings sidebar splits into two groups in multi-display mode:

- **Defaults** — every shared value (display, sleep, alerts, location, weather, calendar, profiles, integrations, security, etc.). These apply to *every* display until a specific one overrides them. Each defaults page shows a backlink banner at the top listing which displays currently override its fields, with one click to jump to that display.
- **Per display** — one drill-down page per registered display, plus an "All displays" landing page (the card grid where you adopt new displays). Each drill-down has two sub-tabs: Overview (profile, identity, adoption info) and Overrides (display, sleep, and alert settings for this display).

On a per-display page, the simple inheritable fields (rotation interval, transition effect and duration, theme, cursor hiding, and pause) are each rendered as their own **OverrideRow**. A row starts in the *default* state (dimmed control, "Override" button) and flips to *overridden* when you click Override (full-opacity blue-tinted row, "Reset to default" button). The help text under each field always links back to the source defaults page, so you can navigate from a per-display field to its global default and back.

Sleep and alerts work differently: each is overridden as a **single block** with one Override button covering the whole group, rather than field by field. See [Configuration shape](#configuration-shape) below for what that means for the values you don't change.

Resolution and rotation live directly on the `DisplayNode` and have no shared default to inherit from — they're rendered as plain inputs at the top of the per-display **Overrides** sub-tab with a **Per display** tag, distinct from the inheritable fields below.

In single-display installs (`displays` undefined or empty), the sidebar collapses back to a flat list of the same settings pages — exactly like the pre-multi-display layout. Every multi-display affordance is hidden so legacy installs see zero UI delta.

---

## Per-display profiles

Each display owns its own profile list. Profile activation through the API or remote control targets the chosen display only — other displays keep their current profile.

In multi-display mode profiles are always per-display. When the first additional display is added, `config.profiles` and `config.settings.activeProfile` are migrated onto the auto-created `main` display alongside its screens; subsequent displays start with an empty owned profile list so they build fresh against their own screens. Owned profile `screenIds` reference the display's own `screens`, never the global pool — this is the same owned-vs-pool rule that applies to screens, and for the same reason: a pool profile's screen references would silently diverge from each display's owned screens as soon as either one was edited.

---

## Remote control

As soon as any display is registered, the `/remote` page shows a segmented **DisplayPicker** at the top: **All / Kitchen / Bedroom / …**. Brightness, alerts, and next/prev/wake/sleep target the selected display, and picking **All** sends them to every display at once.

Profile switching is the one exception: it can only target a single display, because each display has its own separate list of profiles and there is no shared profile that applies to all of them. Pick a specific display before switching profiles.

The picker is hidden in installs with no registered displays, so existing remote bookmarks keep working with no change.

You can also put a **Display control** widget on a screen: a touch panel that wakes, sleeps, changes brightness, or moves to the next screen on the display it's sitting on, another display by name, or all of them at once. See [Display Control](/docs/module-reference#display-control) in the module reference for its settings.

---

## API targeting

Display control endpoints accept an optional `displayId` to target a specific display. There are two ways to provide it:

- **Query string** — `?display=kitchen` (works for GET and POST, useful for bookmarkable simple commands)
- **JSON body field** — `{ "displayId": "kitchen", … }` (POST only)

Use `all` as the display ID to broadcast to every registered display plus the legacy default queue. Broadcast is allowed for command-enqueue actions (simple commands, brightness, alert) and rejected for read-only or mutate-config actions (status, profile).

### Examples

These examples work as written when you haven't set a password. If you have, add your **Display Token** to each call: either `-H 'Authorization: Bearer <token>'`, or `&token=<token>` on the URL for the bookmarkable GET commands. You'll find it under **Settings > Security > Display Token**. The registry endpoint further down needs the header form; the `token=` shortcut only works on `/api/display/*` URLs.

Wake the kitchen display:

```bash
curl http://<hub>:3000/api/display/wake?display=kitchen
```

Set brightness on the bedroom display:

```bash
curl -X POST http://<hub>:3000/api/display/brightness \
  -H 'Content-Type: application/json' \
  -d '{"value": 30, "displayId": "bedroom"}'
```

Broadcast an alert to every display:

```bash
curl -X POST http://<hub>:3000/api/display/alert?display=all \
  -H 'Content-Type: application/json' \
  -d '{"type": "info", "title": "Dinner", "message": "Come eat", "duration": 30000}'
```

Switch the kitchen display to a profile. This one changes your saved configuration rather than just sending a command, so on a password-protected install it needs a real login session rather than the display token:

```bash
curl -X POST http://<hub>:3000/api/display/profile \
  -H 'Content-Type: application/json' \
  -d '{"profile": "evening", "displayId": "kitchen"}'
```

Calls without a `displayId` continue to drive the legacy single-display queue, so single-display installs and existing scripts keep working unchanged.

---

## Inspecting registered displays

The hub exposes a read-only registry endpoint:

```bash
curl http://<hub>:3000/api/displays
```

**Response:**

```json
{
  "displays": [
    {
      "id": "kitchen",
      "name": "Kitchen",
      "screenCount": 3,
      "activeProfile": "morning",
      "settings": { "rotationIntervalMs": 45000 },
      "displayWidth": 1080,
      "displayHeight": 1920,
      "displayTransform": "90",
      "lastSeen": 1709913600000,
      "reportedViewport": { "width": 1080, "height": 1920 },
      "viewportReports": [
        { "width": 1080, "height": 1920, "address": "192.168.86.187", "tabCount": 1 }
      ],
      "status": {
        "currentScreen": { "id": "abc-123", "name": "Main" },
        "displayState": "active",
        "activeProfile": null
      }
    }
  ],
  "unadopted": [
    {
      "id": "home-screens-hysd",
      "lastSeen": 1709913600000,
      "reportedViewport": { "width": 1920, "height": 1080 },
      "viewportReports": [
        { "width": 1920, "height": 1080, "address": "192.168.86.190", "tabCount": 1 }
      ]
    }
  ]
}
```

`screenCount` is a count rather than the screens themselves, so polling this endpoint every few seconds stays cheap and never exposes module settings. `activeProfile` and `settings` are only present when that display has them set. `lastSeen` is `null` until the display's first heartbeat, which is the normal state right after adoption and for a few seconds after a hub restart, and `status` is `null` for the same reason.

The `?id=<id>` form is used by the spoke's waiting-room screen to check whether it has been adopted yet:

```bash
curl http://<hub>:3000/api/displays?id=kitchen
# {"adopted": true, "displayId": "kitchen"}
```

---

## Limits and validation

To bound the in-memory state on the hub, the following caps apply:

| Limit | Value |
|---|---|
| Maximum displays per config | 64 |
| Maximum screens per display | 256 |
| Maximum display ID length | 64 characters |
| Display ID format | URL-safe slug — lowercase letters, digits, hyphens; must start with a letter or digit |
| Maximum dimension (width or height) | 16384 pixels |
| Viewport reports per display | 16 most-recent clients |
| Viewport report TTL | 60 seconds |

Display IDs are validated at both the route layer and the data layer. The reserved word `all` cannot be used as a display ID — it is only valid as a broadcast target on command-enqueue endpoints.

---

## Configuration shape

The multi-display registry lives on `ScreenConfiguration.displays`. When this field is undefined or empty, the system runs in single-display mode — there is no `displays` field to manage and the legacy `screens` array is rendered directly. See [Configuration](/docs/configuration#display-node-multi-display) for the full type.

```typescript
{
  version: 5,
  settings: { /* global defaults */ },
  screens: [ /* only used in single-display mode; every display owns its own screens */ ],
  profiles: [ /* legacy pool: a display with its own profiles list ignores this,
                  a display without one still falls back to it */ ],
  displays: [
    {
      id: "kitchen",
      name: "Kitchen",
      screens: [ /* owned screens, designed at this display's resolution */ ],
      displayWidth: 1080,
      displayHeight: 1920,
      displayTransform: "90",
      profiles: [ /* owned profiles; screenIds reference this display's screens */ ],
      activeProfile: "morning",
      settings: { rotationIntervalMs: 45000 },  /* per-display overrides */
      rules: [ /* condition-to-action rules, owned like screens */ ]
    },
    {
      id: "living-room",
      name: "Living Room TV",
      screens: [ /* a different layout designed at 1920x1080 */ ],
      displayWidth: 1920,
      displayHeight: 1080,
      displayTransform: "normal"
    }
  ]
}
```

Per-display dimension fields override the global `settings.displayWidth` / `displayHeight` / `displayTransform`.

Per-display `settings` override the global equivalents one field at a time for the simple values (rotation interval, transition effect and duration, theme, cursor hiding, pause). **Sleep and alerts are different: each is replaced as a whole block.** The moment you override sleep for a display, that display stops inheriting *any* sleep value from the defaults page, so set all of them on the display's own page. The same goes for alerts. This is deliberate; a partial override would leave some sleep values coming from one page and some from another, which is nearly impossible to reason about when a display starts dimming at the wrong time.

Rotation is authoritative for canvas orientation. The hub sorts the (width, height) pair so the long edge points along the landscape axis when the rotation is `normal`/`180` and along the portrait axis when it's `90`/`270`, regardless of how the values were entered into the form.

---

## Stranded displays

If you delete a display from the editor while a spoke is still pointed at the deleted URL, the spoke lands on a **DisplayNotFound** waiting-room screen. When the hub already has other registered displays, the waiting room shows a visible 60-second countdown and a "Go to default display now" button. Once the countdown hits zero (or the user clicks the button) the spoke navigates to `/display`, which loads the current default display. No power cycle is needed.

A bootstrap install with no other displays registered (i.e. waiting for its first adoption) skips the countdown and waits indefinitely for the editor to adopt it.

While waiting, the spoke continues to POST status heartbeats with its post-rotation viewport, so an unadopted display still appears in the editor with the resolution it would render at.

---

## Troubleshooting

### A spoke doesn't appear under Unadopted Displays

1. Verify the spoke can reach the hub: `curl http://<hub>:3000/api/system/build-id` from the spoke
2. Check that `DISPLAY_URL` in `/opt/home-screens/current/data/kiosk.conf` on the spoke points at the correct hub
3. Wait up to 10 seconds — the unadopted poll runs every 5 seconds and the editor refreshes every 5 seconds
4. Confirm the display ID matches the format rules (lowercase, digits, hyphens, ≤64 chars)
5. The hub evicts unadopted displays whose last heartbeat is older than 2 minutes — restart the spoke to make it re-register

### Two browser tabs reporting under one display ID

Each browser tab carries a stable `clientId` from `sessionStorage`, so the hub distinguishes "two tabs reporting from one Pi" from "two distinct devices reporting under one ID". Two tabs at the same URL on the same Pi collapse into one row with a `×2 tabs` badge. This is harmless, but if you didn't intend it, close the duplicate tab.

### Two distinct IPs reporting under one display ID

This means you have two Pis pointed at the same display URL. They render the same content but report independently, and editor commands fan out to both. To split them, reinstall one of the Pis with a different `--display-id` and adopt it as a separate display.

### A spoke is stuck on a 60-second countdown

Its display ID was deleted from the hub. Either click "Go to default display now" on the spoke, wait for the countdown to expire (it auto-navigates to the current default), or re-create the display in the editor with the original ID.

### The editor's Display Switcher is missing

The Display Switcher pill is hidden when only one display is registered. As soon as you add a second display from **Settings > Per display > All displays**, the pill appears in the editor toolbar.
