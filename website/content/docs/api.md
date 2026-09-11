---
title: API Reference
nextjs:
  metadata:
    title: API Reference
    description: The Home Screens endpoints you call from scripts and home automation, and every endpoint with the access it needs.
    alternates:
      canonical: /docs/api
---

The editor, the remote and every display talk to the hub through its API under `/api/`. This page documents the endpoints you would call yourself from a script, a bookmark or a home automation system such as Home Assistant: [display control](#display-control), [chores](#chores), [meals](#meals), [timers](#timers) and [backups](#backups). Every other endpoint is listed under [All endpoints](#all-endpoints) with the access it needs. Those are the app's own plumbing, and the route file under `src/app/api/` is the reference for each one.

## Access

Most endpoints are protected, but **only once you set a password** in Settings > Security. On a fresh install with no password, every check described here does nothing and the whole API is open to anyone on your network. That is the default, and it is why the endpoints below say "requires a valid session" rather than "always requires a valid session".

There are three levels of protection:

| Level | What it accepts | Used by |
|---|---|---|
| Session | The `hs-session` cookie set by `POST /api/auth/login` | Endpoints that change settings or read credentials |
| Display | The session cookie **or** a display token | Everything a screen polls: config, weather, calendar, commands, chore data |
| Media | Display access **or** a signed `mt` token bound to one file | The routes that serve photos and videos into `<img>` and `<video>` tags |

Endpoints below that say "requires a valid session" are the first level. Endpoints that say "display access" are the second, and a browser session works for those too.

A few endpoints are open at every level on purpose, and each one says so where it appears: `GET`/`POST /api/chores` and `GET`/`POST /api/rewards` (so the kid-facing `/chores` page keeps working when a password is set), `GET /api/plugins/registry`, `GET /api/system/build-id`, and `GET /api/plugins/auth/callback`.

### Using the display token

`GET /api/auth/display-token` returns the token (session required). Send it as a header:

```
Authorization: Bearer hs_abc123...
```

For bookmarkable links, the `/api/display/*` routes also accept the token as a `?token=` query parameter, for example `/api/display/wake?display=kitchen&token=hs_abc123...`. That shortcut is scoped to `/api/display/*` and nowhere else; every other endpoint needs the header or the session cookie. Query tokens end up in browser history and server logs, so use the header wherever you can send one.

If you have an IP allowlist configured with **Bypass authentication for trusted IPs** turned on, requests from those addresses clear display access with no token at all.

### Cross-origin writes

Every `POST`, `PUT`, `PATCH` and `DELETE` under `/api/` is refused with `403` when the request carries an `Origin` header that does not match the hub's own address. Browsers add that header to every cross-site request and page scripts cannot remove it, so a web page on some other site cannot make a browser in your house change your settings, even on an install with no password. Requests with no `Origin` header at all are allowed, so `curl`, Home Assistant, scripts and the per-Pi reporter are unaffected. `GET` and `HEAD` are never checked.

If you call the API from a page served somewhere else on purpose (a dashboard on another host, for example), list that page's origin in the `HS_ALLOWED_ORIGINS` environment variable of the Home Screens service, comma-separated. A full origin (`http://dashboard.local:8123`) or a bare host (`dashboard.local`) both work; the comparison is on the host.

---

## Display Control

Remote control endpoints for the kiosk display. The display polls for pending commands; the editor or any HTTP client can enqueue commands.

If you're scripting a display, a Home Assistant automation, a bookmark on your phone, the endpoints you want are [`/api/display/:command`](#get-api-display-command) (wake, sleep, next-screen, prev-screen), [goto-screen](#post-api-display-goto-screen), [brightness](#post-api-display-brightness), [sleep-override](#post-api-display-sleep-override), [profile](#post-api-display-profile), [alert](#post-api-display-alert), and [module-command](#post-api-display-module-command) (next story on a news module). For a ready-made Home Assistant package built on them, voice sentences included, see the [Voice Control guide](/docs/voice-control). The rest of this section documents the protocol the kiosk itself speaks and is marked **Client protocol** where it applies; you only need it if you're writing your own display client.

### Targeting a display (multi-display)

When the hub has more than one display registered, every display-control endpoint accepts an optional display target. There are two ways to provide it:

- **Query string**: append `?display=<id>` (works on GET and POST). Useful for bookmarkable simple commands like `/api/display/wake?display=kitchen`.
- **JSON body field**: `{ "displayId": "<id>", … }` (POST only).

Use the reserved word `all` as the display target to broadcast to every registered display plus the legacy default queue. Broadcast is allowed for command-enqueue actions (simple commands, brightness, sleep-override, alert, module-command) and rejected for read-only or mutate-config actions (status, profile). It is also rejected for goto-screen, even though that enqueues a command, because screen sets differ per display and a broadcast jump would be meaningless on most of them.

Calls with no display target continue to drive the legacy single-display queue, so single-display installs and existing scripts keep working unchanged. See the [Multi-display guide](/docs/multi-display) for the full multi-display setup.

**Bookmarks need a token once you set a password.** Every endpoint in this section is protected at the display level, and a link you tap from your phone can't send an `Authorization` header. Add the display token to the link instead:

```
/api/display/wake?display=kitchen&token=hs_abc123...
```

Get the token from `GET /api/auth/display-token`. This `?token=` shortcut works on `/api/display/*` and nowhere else; anything outside that path needs the header or a signed-in browser session. With no password set, none of this is needed and the plain URL works.

### GET /api/displays

Read-only registry of all configured displays plus runtime heartbeat data the hub has collected from polling display-only Pis. Used by the editor's **Per display > All displays** page and by display-only Pis waiting for adoption. Display access.

The configuration behind this response is re-read at most every 1.5 seconds, so a change you just saved can take one poll cycle to show up here.

| Parameter | Type | Description |
|---|---|---|
| `id` | string | Optional. When provided, returns a minimal `{adopted, displayId}` shape used by display-only Pis to poll for adoption. Without `id`, returns the full registry. |

**Response (full):**

```json
{
  "displays": [
    {
      "id": "kitchen",
      "name": "Kitchen",
      "screenCount": 3,
      "activeProfile": "evening",
      "settings": { "rotationInterval": 30, "transitionEffect": "fade" },
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
    { "id": "home-screens-hysd", "lastSeen": 1709913600000, "reportedViewport": { "width": 1920, "height": 1080 } }
  ]
}
```

**Response (`?id=kitchen`):**

```json
{ "adopted": true, "displayId": "kitchen" }
```

`settings` is that display's full set of [per-display overrides](/docs/multi-display): rotation interval, transitions, sleep schedule, screensaver, theme, alerts, and so on. It only contains the values that display actually overrides. `lastSeen` is `null`, rather than missing, for a display that has never checked in.

This endpoint is read-only, all writes go through `PUT /api/config` so undo/redo and validation stay consistent.

### GET /api/display/commands

**Client protocol.** Returns and drains all pending commands from the queue. The display polls this endpoint every 3 seconds. Pass `?display=<id>` to drain a specific display's queue; without it the legacy default queue is drained.

**Response:**
```json
{
  "commands": [
    { "type": "wake" },
    { "type": "brightness", "payload": { "value": 50 } }
  ],
  "sharedStateWatched": false
}
```

`sharedStateWatched` tells the screen whether anyone is currently watching its shared values in the editor. While it is `true`, the screen reports changes as they happen instead of waiting for its next 30-second heartbeat, so the editor sees live values; while it is `false`, it stays on the slower schedule. A display client that ignores this flag still works, it just never speeds up.

### GET /api/display/status

Returns the last-known display status as reported by the display client. Accepts `?display=<id>` for the multi-display case; without a target, the legacy default queue's status is returned. Before the first heartbeat arrives this returns `404 { "error": "No status reported yet" }`.

**Response:**
```json
{
  "currentScreen": { "index": 0, "id": "abc-123", "name": "Main" },
  "screenCount": 3,
  "activeProfile": "evening",
  "displayState": "active",
  "timestamp": 1709913600000,
  "lastSeen": 1709913600000,
  "reportedViewport": { "width": 1080, "height": 1920 },
  "hwStats": { "cpuUsagePercent": 14.2, "cpuTemperatureC": 52.1, "memoryUsagePercent": 46.0, "uptimeSeconds": 86400, "model": "..." },
  "browserStats": { "viewportWidth": 1080, "viewportHeight": 1920, "userAgent": "...", "timezone": "America/Chicago" }
}
```

`hwStats` is present only when the per-Pi reporter has posted to `/api/display/hw-stats`. `browserStats` is present once the display has sent at least one heartbeat from a modern client; older clients omit it.

### GET /api/display/shared-state

Returns the most recent snapshot of a display's [shared values](/docs/plugin-development#shared-state-and-visibility-conditions), the named values plugins publish and that modules can be shown or hidden by. The editor polls this while a visibility-conditions panel is open so it can show what each value currently is on the real screen.

| Parameter | Type | Description |
|---|---|---|
| `display` | string | Which display's snapshot to read. Omit it in single-display mode |

**Response:**
```json
{
  "entries": {
    "livingroom_motion": { "value": "on", "updatedAt": 1709913600000 },
    "front_door": { "value": "closed", "updatedAt": 1709913000000, "staleAt": 1709913500000 }
  },
  "reportedAt": 1709913600000,
  "providerHealth": {
    "home-assistant": { "ok": false, "message": "Can't reach Home Assistant", "since": 1709913000000 }
  }
}
```

An entry with `staleAt` is one whose publisher has let go of it: the last known value is kept for a short grace window so a plugin restarting doesn't make conditioned modules blink, and the editor badges it as no longer updating.

A display that hasn't reported yet returns `{ "entries": {}, "reportedAt": null }` rather than a `404`, because having no snapshot yet is a normal state while a screen is starting up, not an error. You'll get the same empty answer for a display that has stopped reporting for more than five minutes. `providerHealth` only appears when a plugin publishing these values is currently having trouble, and lists only the ones that are.

Polling this endpoint is also the signal that someone is watching. It marks the display as watched for the next 15 seconds, which turns on the `sharedStateWatched` flag in that display's next command drain and switches it to reporting changes as they happen. Stop polling and it drifts back to the 30-second heartbeat on its own.

### GET /api/display/:command
### POST /api/display/:command

Simple commands, bookmarkable via GET or scripted via POST. Supported commands: `wake`, `sleep`, `next-screen`, `prev-screen`, `reload`, `clear-alerts`. Pass `?display=<id>` or include `displayId` in a POST body to target a specific display; `?display=all` broadcasts.

**Response:** `{ "ok": true, "command": "wake" }`

### POST /api/display/brightness

Sets the display brightness.

**Body:** `{ "value": 50 }` (0-100)

**Response:** `{ "ok": true, "command": "brightness", "value": 50 }`

### POST /api/display/goto-screen

Jumps the display straight to a specific screen, the command behind "show the calendar" in the [Voice Control guide](/docs/voice-control) and the Display Control module's screen buttons.

**Body:** `{ "screen": "calendar", "displayId": "kitchen" }` (`displayId` optional)

`screen` is a screen **id or name**; the display client resolves it against its own rotation, matching the id first and then the name case-insensitively. The hub can't validate the target (screen sets are per-display and the queue never reads config), so an unknown target still returns `ok` here and is ignored with a console warning on the display. A screen excluded from the current rotation, for example by the active profile, is also ignored rather than jumped to. Does **not** accept `all` as a target; an empty or missing `screen` returns `400`.

**Response:** `{ "ok": true, "command": "goto-screen", "screen": "calendar" }`

### POST /api/display/module-command

Pokes every module of one type on the display. The hub just relays it; the module decides what the action means. Today the news modules understand `next`, `prev` (move to the next or previous story or page), `details` (open the current story's summary), and `dismiss` (close it), so "next story" can be a voice command or a button. Broadcast with `?display=all` is allowed.

**Body:** `{ "module": "news", "action": "next", "displayId": "kitchen" }` (`displayId` optional; `module` is `news` or `fullscreen-news`; an optional `value` string or number is passed through)

`module` and `action` must be short lowercase names (letters, digits, `-`, `_`, `:`); anything else returns `400`.

**Response:** `{ "ok": true, "command": "module-command", "module": "news", "action": "next" }`

### POST /api/display/sleep-override

Wakes the display and holds off the automatic sleep machinery, the sleep schedule, the dim schedule, and idle transitions, for a number of minutes. This is "keep the display on tonight": use it when you need a specific, longer duration. A plain `wake` during a scheduled sleep or dim window also holds the display awake, but only for the display's "After a wake-up, stay on for" setting (5 minutes by default). Holds only ever extend, a shorter wake never cuts an existing longer hold short. An explicit `sleep` command (or brightness `0`) cancels the hold early. Broadcast with `?display=all` is allowed.

**Body:** `{ "minutes": 480 }` (1 to 1440, anything longer than 24 hours is rejected with `400`)

**Response:** `{ "ok": true, "command": "sleep-override", "minutes": 480 }`

### POST /api/display/profile

Switches the active profile. Persists the selection to the config file. Display access, a display token is enough, same as the other command verbs, so a Home Assistant automation can switch profiles; the write only touches the active-profile pointer, the same value the display's own rules engine flips. Accepts `?display=<id>` or `displayId` in the body; does **not** accept `all` (profile switches are per-display).

**Body:** `{ "profile": "profile-id", "displayId": "kitchen" }` (`displayId` optional)

An unknown display returns `404 { "error": "Unknown display: <id>" }`, and a profile that display can't use returns `404 { "error": "Unknown profile: <id>" }`. The config is updated in one read-modify-write step, so switching a profile here can't wipe out an editor save happening at the same moment.

**Response:** `{ "ok": true, "profile": "profile-id", "displayId": "kitchen" }`

### POST /api/display/alert

Shows an alert overlay on the display.

**Body:**
```json
{
  "type": "info",
  "title": "Alert Title",
  "message": "Alert message body",
  "duration": 10000,
  "icon": "bell",
  "dismissible": true
}
```

The `type` field accepts `info`, `warning`, or `urgent`; anything else quietly becomes `info` rather than failing. The `icon`, `duration`, and `dismissible` fields are optional. `duration` is in milliseconds; send `0` and the alert stays up until it is dismissed, whatever its type. Omit it and the display's default duration from **Settings > Screen > Alerts** applies; if that isn't set either, the per-type defaults kick in, 10 seconds for `info`, 30 seconds for `warning`, and `urgent` stays up until dismissed. At least one of `title` or `message` is required; send neither and you get `400 { "error": "title or message required" }`.

**Response:** `{ "ok": true, "command": "alert" }`

### POST /api/display/status

**Client protocol.** Reports the current display state. Called by the browser display client every 30 seconds (and on any state change). Goes through `withDisplayAuth`: the kiosk sends a display bearer token on every request.

**Body:**
```json
{
  "displayId": "kitchen",
  "clientId": "tab-a1b2",
  "currentScreen": { "index": 0, "id": "abc-123", "name": "Main" },
  "screenCount": 3,
  "activeProfile": null,
  "displayState": "active",
  "timestamp": 1709913600000,
  "browserStats": {
    "viewportWidth": 1080,
    "viewportHeight": 1920,
    "userAgent": "Mozilla/5.0 ...",
    "timezone": "America/Chicago"
  },
  "sharedState": {
    "livingroom_motion": { "value": "on", "updatedAt": 1709913600000 }
  },
  "providerHealth": {
    "home-assistant": { "ok": false, "message": "Can't reach Home Assistant", "since": 1709913000000 }
  }
}
```

Required fields: `currentScreen` (object with `id` string), `displayState` (one of `active` / `dimmed` / `asleep`: anything else is rejected), and `timestamp` (number). `displayId` is the display-registry ID; omit it in legacy single-display mode. `clientId` distinguishes multiple tabs reporting under the same display ID so the editor can surface "which tab is phantom-heartbeating."

`browserStats` is optional, when present, its `viewportWidth`/`viewportHeight` are also mirrored into a legacy top-level `reportedViewport` field so older consumers keep working. Any `hwStats` field sent to this endpoint is silently dropped, hardware telemetry now posts to `/api/display/hw-stats` instead.

`sharedState` and `providerHealth` are both optional and both ride along on the heartbeat rather than having endpoints of their own. `sharedState` is this tab's snapshot of its [shared values](/docs/plugin-development#shared-state-and-visibility-conditions) and `providerHealth` reports any plugin currently failing to supply them. Neither is stored with the rest of the status; they go into their own store and come back out of [`GET /api/display/shared-state`](#get-api-display-shared-state).

**Response:** `{ "ok": true }`

### POST /api/display/hw-stats

**Client protocol.** Accepts a hardware-stats snapshot from a display Pi's bash reporter (`scripts/reporter.sh`, on a systemd timer). Adoption IS authorization: the endpoint is **not** wrapped in `withDisplayAuth` because the reporter runs on a separate Pi that can't reasonably carry a display bearer token. Instead, the `displayId` must appear in `config.displays` (or be the literal `main` in legacy single-display mode). The LAN is the trust boundary.

**Body:** `{ "displayId": "kitchen", "hwStats": { "cpuUsagePercent": 14.2, "cpuTemperatureC": 52.1, "memoryUsagePercent": 46.0, "uptimeSeconds": 86400, "model": "Raspberry Pi 5 Model B Rev 1.0" } }`

**Response:** `{ "ok": true }`. Returns `403` with `Display '<id>' is not adopted` when the displayId isn't in the registry.

### POST /api/display/console-log

**Client protocol.** Uploads a batch of browser console entries for a display. Called by the kiosk in response to a `dump-console-log` command (which `/api/system/diagnostics` broadcasts before composing its bundle). Goes through `withDisplayAuth`.

**Body:**
```json
{
  "displayId": "kitchen",
  "entries": [
    { "level": "log", "message": "...", "timestamp": 1709913600000 },
    { "level": "warn", "message": "...", "timestamp": 1709913601000 },
    { "level": "error", "message": "...", "timestamp": 1709913602000 }
  ]
}
```

Entries are capped at 500 per request and messages at 2 000 characters each (longer messages are truncated). Only the three log levels `log` / `warn` / `error` are accepted; anything else is silently dropped.

**Response:** `{ "ok": true, "stored": 42 }`

### GET /api/display/kiosk-bundle

**Client protocol.** Serves a display-only Pi its shell layer (kiosk launcher, splash page, reporter, systemd units) so display-only Pis keep themselves up to date with the hub. The display-only Pi's `kiosk-update.sh` polls this endpoint nightly and on every Chromium start, verifies the checksum, and swaps files in place with a rollback copy. Uses the same adoption gate as `/api/display/hw-stats`: the `display` ID must appear in `config.displays`, and an unadopted display-only Pi gets a `403` that its updater treats as "no update".

| Parameter | Type | Description |
|---|---|---|
| `display` | string | The display-only Pi's display ID. Required. |
| `manifest` | string | Set to `1` to get the JSON manifest instead of the tarball |

**Response:** with `manifest=1`, `{ "version", "sha256", "restartAdvised", "files": [...] }`: `restartAdvised` is computed on the hub from the display's sleep state, so a display someone is looking at is never told to restart itself mid-evening. Without it, the deterministic `application/gzip` tarball itself. Returns `503` when the hub can't compose a bundle, which the display-only Pi reads as "try again later".

### GET /api/display/kiosk-bootstrap

**Client protocol.** Returns a one-shot shell script that puts a Pi installed *before* self-update existed onto the self-updating path. The editor surfaces the copy-paste line next to any display that has never reported its display-software version:

```bash
curl -fsS "http://<hub>:3000/api/display/kiosk-bootstrap?display=<id>" | bash
```

After it runs once, that Pi updates itself from `/api/display/kiosk-bundle` from then on. Same adoption gate as the bundle endpoint; because the response is piped into bash, errors come back as shell `echo`/`exit` lines rather than JSON.

### GET /api/display/power-state

**Client protocol.** Polled every few seconds by the panel power helper in a Pi's kiosk session (`scripts/kiosk-power-agent.sh`). Answers whether that display's screen should be powered right now:

```bash
curl "http://<hub>:3000/api/display/power-state?display=kitchen&applied=on"
```

```json
{ "power": "off" }
```

`off` only when all three hold: the display's sleep settings have **Switch the screen's power off too** turned on, its browser's last heartbeat said `asleep`, and that heartbeat is less than 90 seconds old. Anything else, including a display that has never reported, answers `on`, so a crashed browser always gets its screen back. The optional `applied` parameter (`on` or `off`) is the state the helper currently has set; the hub records it with the display's status so the editor can show whether screen power control is working. Same adoption gate as `hw-stats`; in single-display mode, `display=main` reads the hub's own display.

---

## Chores

### GET /api/chores

Returns chore completion records. Automatically purges entries older than 90 days. Public on the LAN with no authentication so the kid-facing `/chores` view works even when the editor password is set.

**Response:**
```json
{
  "completions": [
    {
      "choreId": "chore-1",
      "memberId": "member-1",
      "date": "2026-03-08"
    }
  ]
}
```

### POST /api/chores

Toggles a chore completion. If the completion already exists for the given choreId + memberId + date, it is removed; otherwise it is added. Public on the LAN (no session required) so kids can mark chores done from the `/chores` view.

**Body:**
```json
{
  "choreId": "chore-1",
  "memberId": "member-1",
  "date": "2026-03-08",
  "direction": "complete"
}
```

The `date` field must be a real `YYYY-MM-DD` calendar date within the last 90 days. Future dates, invalid calendar dates (e.g. `2026-02-30`), and dates outside the retention window are rejected with `400`. Toggling a chore with a non-zero point value also credits or debits the member's reward balance; if removing a past completion would drive the balance negative, the response includes a `warning` string explaining the deficit.

`direction` is optional. Omitted, the call is the flip described above. Set to `"complete"` or `"uncomplete"`, the call only ever moves the chore in that direction and is a no-op when it's already there, so a repeated "mark it done" (a voice assistant, a retried request) can never accidentally un-complete a chore and take the points back. Any other value is rejected with `400`.

**Response:**
```json
{
  "completions": [ ... ],
  "changed": true,
  "rewards": { "rewards": [ ... ], "balances": { "member-1": 122 }, "redemptions": [ ... ] },
  "warning": "..."
}
```

`changed` reports whether this call actually flipped anything, `false` means the directional request found the chore already in the requested state (and no points moved). `rewards` is the full updated reward state and is included whenever the toggled chore is worth more than zero points, so the client doesn't have to re-fetch `/api/rewards`. It is omitted for zero-point chores. `warning` is only present in the deficit case described above.

### GET /api/chores/today

Returns the **resolved** per-member chore list for one day, who actually owes what, with rotation (daily/weekly/schedule grids) and frequency rules already applied server-side, plus each chore's completion state. This is what the chore chart renders; use it instead of re-deriving assignments from `/api/chores/data`. Powers the "what chores does Alice have left?" question in the [Voice Control guide](/docs/voice-control). Display access.

| Parameter | Type | Description |
|---|---|---|
| `date` | string | Optional `YYYY-MM-DD`. Defaults to today (hub-local). Invalid or impossible dates return `400`. |

**Response:**
```json
{
  "date": "2026-08-03",
  "members": [
    {
      "id": "member-1",
      "name": "Alice",
      "chores": [
        { "id": "chore-1", "name": "Make bed", "points": 2, "timeOfDay": "morning", "completed": true }
      ]
    }
  ]
}
```

Every member appears, including those with no chores that day (empty `chores` array).

### GET /api/chores/data

Returns `{ "chores": [...] }` from `data/chores.json`. Display access. Each definition contains `id`, `name`, `emoji`, `points`, frequency fields, `assigneeIds`, rotation and an optional schedule. Member IDs refer to the roster returned by `/api/family`.

### PUT /api/chores/data

Replaces the chore definitions. Requires a valid session. Send `{ "chores": [...] }`. An empty replacement of non-empty chore data requires `force: true`. Payloads containing the former `members` field are rejected with a refresh-required error; use `/api/family` for family edits. Assignments must refer to current family members.

**Response:** The saved `{ "chores": [...] }` object.

---

## Meals

### GET /api/meals/data

Returns saved meals, weekly plan, grocery checked state, and shared meal-planner settings from `data/meals.json`. Accessible by the display (display token auth).

**Response:**
```json
{
  "savedMeals": [
    { "id": "meal-1", "name": "Tacos", "emoji": "🌮", "tags": ["quick"], "prepTime": 20, "difficulty": "easy" }
  ],
  "plan": [
    { "date": "2026-04-04", "slot": "dinner", "mealId": "meal-1" }
  ],
  "groceryChecked": ["tortillas"],
  "settings": {
    "enabledSlots": ["breakfast", "lunch", "dinner"],
    "weekStartDay": "monday",
    "defaultSlotTimes": { "breakfast": "07:30", "lunch": "12:00", "dinner": "18:00" },
    "timeFormat": "12h"
  },
  "globalTimeFormat": "12h"
}
```

`settings.timeFormat` is optional, when absent, meal times follow the household `GlobalSettings.timeFormat`, which the top-level `globalTimeFormat` field mirrors so clients can resolve "follow global" without a second config fetch. The `plan` array uses ISO date strings (e.g. `"2026-04-04"`) for multi-week support. Entries older than 12 weeks are pruned on write.

### PUT /api/meals/data

Partial update, every writable field is optional, and omitted fields are preserved from the existing on-disk data. The request must include at least one of `savedMeals`, `plan`, `groceryChecked`, or `settings`, or the server returns `400`. Requires a valid session.

The entire read-modify-write cycle runs inside the meal-data store queue, so cross-surface writers (editor settings sheet, `/remote`, grocery checks) cannot interleave and silently lose each other's edits.

**Body (all fields optional):**
```json
{
  "savedMeals": [ ... ],
  "plan": [ ... ],
  "groceryChecked": [ ... ],
  "settings": { "enabledSlots": ["breakfast", "lunch", "dinner"], "weekStartDay": "monday", "defaultSlotTimes": { "dinner": "18:00" }, "timeFormat": "12h" },
  "force": false
}
```

When `settings` is present it replaces the stored settings object: include `"timeFormat": "12h"` or `"24h"` for an explicit override, or omit the key to follow the household `GlobalSettings.timeFormat`.

When present, `savedMeals`, `plan`, and `groceryChecked` must be arrays. An empty-overwrite guard fires when every `savedMeals` / `plan` field present in the body is `[]` and the existing data is not empty; the write is refused with `409` and you can resend with `force: true` to override. If the body sends both fields and only one of them is empty, that is a normal write and the guard stays out of the way. Settings-only and grocery-only writes skip the guard entirely.

**Response:** The full `{ savedMeals, plan, groceryChecked, settings }` object after the write.

### GET /api/meals/grocery

Returns just the grocery checked state.

**Response:** `{ "groceryChecked": ["tortillas", "cheese"] }`

### GET /api/meals/grocery/list

Returns the **resolved** grocery list for the current week, ingredients aggregated from every meal planned this week, grouped by aisle, with each item's checked state. This is what the remote's Grocery tab shows; the aggregation runs server-side with the same generator, so external callers don't have to re-derive it from the meal plan. "Current week" follows the shared week-start meal setting. Powers "what's on the grocery list?" in the [Voice Control guide](/docs/voice-control). Display access.

**Response:**
```json
{
  "week": { "start": "2026-08-02", "end": "2026-08-08" },
  "categories": [
    { "category": "bakery", "items": [ { "name": "Tortillas", "amount": "12", "checked": false } ] }
  ],
  "total": 4,
  "checked": 1
}
```

### POST /api/meals/grocery

Toggles a grocery item's checked state. If the item is already checked, it is unchecked; otherwise it is checked. Display access, a display token works, so an automation or voice assistant can check items off. The item name is matched after trimming and lowercasing, so senders can use the display-cased name from `/api/meals/grocery/list`.

**Body:**
```json
{
  "item": "tortillas",
  "direction": "check"
}
```

`direction` is optional. Omitted, the call is the historical flip. Set to `"check"` or `"uncheck"`, the call only ever moves the item in that direction and is a no-op when it's already there, so a repeated voice "check off milk" can never silently un-check it. Any other value is rejected with `400`.

**Response:** `{ "groceryChecked": [...], "changed": true }`: `changed` reports whether this call actually flipped anything.

---

## Timers

Visual timers and routines, managed from the remote's Timers tab. Routines are family data like meals and chores, they live in `data/routines.json`, not in the display config. A running timer is a **session**: a snapshot of the steps plus epoch timestamps, so clients derive the countdown locally and editing a routine mid-run can't corrupt it. There is at most one active session household-wide.

### GET /api/timers/routines

Returns the saved routine list. Display access.

**Response:** `{ "routines": [ { "id": "...", "name": "...", "icon": "...", "view": "ring", "sound": true, "steps": [ { "id": "...", "label": "...", "icon": "...", "durationSec": 120, "waitForTap": true } ] } ] }`

`view` is one of `ring`, `face`, `cascade`, or `path`. A step with `waitForTap: true` holds at 0:00 with a "Done!" tap target instead of auto-advancing.

### PUT /api/timers/routines

Replaces the routine list wholesale (the list is capped at 50 and edited from a single form, so replace-the-list avoids partial-update merge rules). Validation is all-or-nothing: one bad routine rejects the whole write with `400`. An empty list is a legitimate write, it's how the last routine is deleted. Requires a valid session.

**Body:** `{ "routines": [ ... ] }`: same shape as the GET response.

### GET /api/timers/session

Returns the active session with elapsed auto-advancing steps already applied, or `{ "session": null }` when nothing is running. Displays poll this every few seconds and compute the live countdown locally from the returned timestamps, so poll latency only delays the start, it never affects countdown accuracy. Display access.

### POST /api/timers/session

Starts a session or controls the running one, selected by `action`:

- `start`: begin a timer. For a routine: `{ "action": "start", "kind": "routine", "routineId": "...", "targets": "all" }`. For a quick timer: `{ "action": "start", "kind": "quick", "durationSec": 300, "targets": "all" }`, with optional `view` and `sound`. `targets` is required and picks which displays the timer takes over: `"all"` or a non-empty array of display IDs. Starting while a session is already running replaces it, one active session at a time is the intended family-display behavior.
- `pause`, `resume`: pause and resume the countdown
- `skip` and `step-done`: the same transition (advance to the next step now); both names exist because remotes skip and touch displays tap Done
- `add-minute`: add a minute to the current step
- `cancel`: stop the session

Display access on purpose, touch kiosks post `step-done` when a kid taps Done. Every mutation runs through an atomic queue, so overlapping taps from multiple displays can't interleave.

**Response:** `{ "session": { ... } }` with the updated session.

---

## Backups

Take and restore a full household backup, the same thing **Settings > Backups & data** does, and read or clear the backup reminder.

### GET/POST /api/backup

Full household backup bundle, exports `config`, `family`, `chores`, `choreCompletions`, `meals`, `rewards`, `routines`, and `todos` as a single JSON file with a `_type: "home-screens-backup"` envelope and a `_version` marker (currently `2`). POST accepts the same shape (plus a legacy config-only format) to restore everything at once. Session required.

GET never returns credentials. A bundle can carry an optional `credentials` section, but only `POST /api/backup/credentials` produces one. This is what **Settings > Backups & data > Save a copy** uses, and it is distinct from the upgrade-time config-only snapshots under `/api/system/backups`.

To restore a bundle whose `credentials` section is encrypted, add a transient `_passphrase` field to the POST body (it is stripped before anything is written and never stored). Credential failures come back as machine codes so the editor can localize them: `400 { "error": "passphrase_required" }` when the section is locked and no password was sent, `400 { "error": "bad_passphrase" }` when it was wrong, and `400 { "error": "invalid_credentials" }` when the section is damaged. None of these write anything, dropping the `credentials` field and re-posting restores everything else.

A restore body is capped at 25 MB. The config inside it is checked for shape and for a valid display registry before anything is written, and if a later part of the bundle fails partway through, the parts that already landed are put back the way they were, so a failed restore doesn't leave a mix of old and new data.

**POST response:** `{ "restored": { "config": true, "chores": true, "choreCompletions": true, "meals": false, "rewards": false } }`, one flag per section, including `family`, `true` for the ones the bundle actually contained. A modern bundle replaces the roster when `family` is present. Older bundles without it retain the current roster and fold legacy chore and calendar identities into it by ID first. When the bundle carried credentials, a `credentials: { applied: [...], skipped: [...] }` object is included too, `applied` naming the sections written, `skipped` naming anything deliberately held back (for example `auth.ipRestrictAccess`, when restoring it would lock the requesting device out). A body that is neither a backup bundle nor a bare configuration returns `400 { "error": "Unrecognized backup format" }`.

### POST /api/backup/credentials

Builds the optional credential section of a backup bundle: `data/secrets.json`, iCloud app passwords, the Google Calendar / Google Photos / OneDrive grants, per-plugin secrets and OAuth tokens, and `data/auth.json`. The response is `Cache-Control: no-store`.

**Requires an editor password to be set**, not merely a session: `requireSession` is a no-op on an install with no password, and this is the only route that returns raw secret *values*. With no password configured it returns `403 { "error": "editor_password_required" }` and logs a `credential_backup_denied` audit entry.

**Body:** `{ "passphrase": "…" }` to seal the section (scrypt + AES-256-GCM, minimum 8 characters), or `{}` for a plaintext one. A password shorter than the minimum returns `400 { "error": "passphrase_too_short" }`.

**Response:** `{ "encrypted": false, "data": { … } }`, or `{ "encrypted": true, "kdf": "scrypt", "kdfParams": {…}, "salt": "…", "iv": "…", "tag": "…", "ciphertext": "…" }`. Sections this device has nothing for are omitted. The caller merges the result into a bundle from `GET /api/backup` as its `credentials` field.

### GET /api/backup/reminder

Returns when you last took a backup and when you last dismissed the reminder about it, which is how the editor decides whether to nudge you. Display access.

**Response:** `{ "lastBackupDate": "2026-03-08T12:00:00.000Z", "lastDismissedDate": null }`

Both fields are `null` until the corresponding thing has happened.

### POST /api/backup/reminder

Updates that state. Display access.

**Body:** `{ "action": "dismiss" }` to put the reminder off, or `{ "action": "backed-up" }` to record that a backup was taken (which also clears the dismissal). Any other `action` returns `400 { "error": "Invalid action" }`.

**Response:** the updated state, the same shape the `GET` returns.

### GET /api/system/backups

Lists available configuration backups. Requires a valid session.

**Response:**
```json
{
  "backups": [
    { "name": "config-v0.9.0-20260308-120000.json", "size": 4096, "date": "2026-03-08T12:00:00Z" }
  ]
}
```

Pass `?download=config-v0.9.0-20260308-120000.json` to download a specific backup file.

### POST /api/system/backups

Restores a configuration backup. Requires a valid session.

**Body:** `{ "name": "config-v0.9.0-20260308-120000.json" }`

**Response:** `{ "ok": true }`

---

## All endpoints

Every route the hub serves, generated from the route files, with the access each method needs:

- **Open**: nothing, even once a password is set.
- **Session**: a signed-in browser (the `hs-session` cookie).
- **Display**: a session or the display token (see [Access](#access)).
- **Media**: display access, or a signed link to one photo or video.
- **Adopted display**: no token, but the `display` ID has to be one the hub has adopted (see [Display-only Pis](/docs/raspberry-pi#display-only-pis)).

With no password set, only the adopted-display check applies.

{% endpoint-list /%}
