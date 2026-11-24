---
name: sandbox-hub
description: "Run a throwaway Home Screens hub with its own private data so a change can be seen and driven in the real app without touching the real household: one command starts a server on a spare port, optionally seeded with a made-up family of seven (chores, rewards, meals, lists, three screens), and a small Playwright harness opens it at phone, tablet, desktop or wall size and collects console errors, failed requests and screenshots. Triggers on: 'try this in the real app', 'test this on /remote', 'check the editor with real data', 'start a sandbox', 'spin up a test hub', 'hand-test this flow', 'usability test', any time a change to /editor, /remote, /chores or /display needs to be observed and the real data/ must stay untouched. For a before/after picture gallery of two trees use compare-renders instead. Repo-specific to home-screens."
---

# Sandbox Hub

## Overview

The dev server on port 3000 reads and writes the real `data/`: the real family, the real chores, the real pictures. This skill starts a second hub that cannot reach any of it. Every data path in the app resolves through the working directory, so a server started inside a folder with its own `data/` and `public/backgrounds/` is fully separate, while the source, the build and `node_modules` are shared with the checkout.

Use it whenever a change has to be seen working: a fix on `/remote`, a new control in the editor, a kid flow on `/chores`, a module on the wall. Use `compare-renders` instead when the deliverable is a side-by-side gallery of two trees.

**Announce at start:** "I'll start a sandbox hub with its own data and try it there."

## Scripts (in `scripts/`, run from the repo root)

- `hub.sh start <port> [--household] [--seed <data-dir>] [--config <file>] [--assets <dir>] [--root <tree>] [--dev] [--lan]` builds the sandbox for that port, starts the server and prints the base URL once it answers. `hub.sh stop <port>` stops it and deletes the sandbox (`--keep` leaves the folder). `hub.sh path <port>` prints the sandbox folder; `data/` and `server.log` are inside. `hub.sh sync <port>` refreshes a `--dev` sandbox after an edit.
- `seed.mts <data-dir>` writes the made-up household. `--household` runs it for you.
- `harness.mjs` exports `open()`, the browser harness described below.

`hub.sh` with no arguments prints its full usage.

## Process

### Step 1: Pick the mode

| You want to see | Mode | Needs |
|---|---|---|
| `/display`, or anything that must behave exactly like a Pi | default (production build) | `npm run build` in the tree |
| `/editor`, `/remote`, `/chores` on work that is not built yet | `--dev` | nothing |

The wall only works in the default mode. Under `--dev` the display page never wakes up in a sandbox: modules sit on their empty state and no `/api/` request is made.

Before building, check that no `next dev` is running in the same tree (`lsof -nP -iTCP:3000 -sTCP:LISTEN`). A build beside a running dev server sends that dev server into a reload storm. If one is running, either use `--dev`, or build in a worktree and pass it as `--root` (inside the worktree: `rm -rf node_modules && cp -Rc <repo>/node_modules node_modules`, then `npm run build`; a linked `node_modules` breaks the build).

An existing `.next/BUILD_ID` is enough if it is newer than the change under test. If it is older, the sandbox serves the old code and the test proves nothing.

### Step 2: Start it

```
.claude/skills/sandbox-hub/scripts/hub.sh start 3140 --household
```

Any free port from 1024 up works. The script refuses a port that is in use, so it cannot collide with the real server.

- `--household` gives seven people in two groups (five kids, which is what member-based UI must cope with), eight chores, four rewards with ticket balances, a week of dinners either side of today, two lists and three screens (`screen-home`, `screen-family`, `screen-weather`), all with registry defaults. Everything is invented and the location is Boulder, Colorado.
- `--seed <dir>` copies your own files into `data/` (`config.json`, `chores.json`, any store). It is applied after `--household`, so one file can override the made-up one. The `version` in a hand-written `config.json` should be the current schema version, or the server migrates it on first read.
- `--config <file>` uses one file as `data/config.json`, applied last. It is the short form when the config is all you need to set.
- None of the three gives a brand-new hub with no data, which is the right start for testing first-run and setup flows.
- `--assets <dir>` puts pictures into `public/backgrounds/` before boot. Next lists `public/` once at startup, so a picture added later answers 404 until a restart.
- `--lan` makes the sandbox answer on this machine's network address as well as `127.0.0.1`. Use it when the visitor must not look like the hub itself: a request from localhost counts as the hub's own screen, and browsers send different headers to localhost than to a plain-http network address. Anything on the network can reach the sandbox while it runs.
- `TZ=Europe/Berlin` in front of the command sets the hub's own time zone. It is the only way to test what the server thinks "today" is.

No `auth.json` means no password: `/editor` and `/remote` open without signing in. To test the sign-in itself, set a password through the editor's Security page inside the sandbox.

Several sandboxes can run at once on different ports, one per tester or per persona, each with its own household. Five production servers with five browsers fit on a laptop.

### Step 3: Drive it

Write a short scenario script that imports the harness by its path. The script itself can live in a scratch folder; `@playwright/test` resolves from the harness, which sits inside the repo.

```js
import { open } from '<repo>/.claude/skills/sandbox-hub/scripts/harness.mjs';

const s = await open({ base: 'http://127.0.0.1:3140', device: 'phone', out: '<scratch>/shots', stubs: 'all' });
await s.goto('/remote');
await s.page.getByRole('button', { name: 'Chores' }).click();
await s.shot('chores');
console.log(await s.text());
await s.done();
```

- `device` is `phone` (390x844, touch), `tablet`, `desktop`, `wall` (1080x1920) or `wallLandscape`.
- `stubs` answers outside-service data (weather, calendar, news, stocks, sports and the rest) from the E2E fixtures in `e2e/fixtures/module-data/`, in the browser, the way the E2E suite does. Pass `'all'` or a list of keys. Without a stub the sandbox's own route runs, and with no API key it shows the module's real "not set up yet" state, which is what you want when that state is the thing under test.
- `blockExternal: true` aborts every request that does not go to the sandbox, so map tiles and embedded pages never load.
- `s.page` is a normal Playwright page. `s.shot(name)` saves a numbered screenshot, `s.text()` returns what a person would read, `s.controls()` lists everything pressable with its size, `s.smallTargets()` lists controls under 44 px (phone and wall only; the editor is a mouse surface), `s.horizontalOverflow()` says whether the page is wider than the screen.
- `s.done()` closes the browser and prints every console error, page error and failed or erroring request seen during the visit. `s.drain()` hands back what was collected so far and starts again, so each step's errors are its own.

One screen of the wall is `/display?screen=<screenId>`. Add `&preview=1` to hold rotation.

Look at the screenshots before reporting. A script that ran without an error has not shown that the page looks right.

To change data mid-test, either go through the app (the real path) or rewrite a file in the sandbox's `data/` folder. The server reads each store per request; `config.json` has a short cache, so wait two seconds after rewriting it.

### Step 4: After an edit

- Default mode: rebuild the tree, then `hub.sh stop <port>` and `start` again. The data is reseeded.
- `--dev`: `hub.sh sync <port>`, then wait for the rebuild before touching the page, and check the DOM for the new markup before trusting a measurement. The first compile of a route under `--dev` takes a few seconds and can reload other open pages; `curl` each route once to warm it before a round-trip test.

### Step 5: Clean up

`hub.sh stop <port>` for every sandbox you started, and delete the scenario scripts. Screenshots worth keeping go wherever the finding is written up.

## Traps

- **Never stop servers by name.** `pkill -f "next start"` leaves the `next-server` child holding the port, and a loose pattern once closed every app on the machine. `hub.sh stop <port>` stops by port and only a port it started.
- **Never start a hand-rolled sandbox without `HS_DISABLE_AUTO_UPDATE=1 HS_DISABLE_TELEMETRY=1`.** The first keeps a tester who turns on automatic updates from updating the real machine; the second keeps every sandbox from being counted as a new install. `hub.sh` sets both.
- **`next dev` may stop once on first boot when an AI coding tool starts it**, to print an upgrade notice for the installed Next version. `hub.sh` relaunches it once and the notice stays in `server.log`. Pass what it says on to the user; do not act on it yourself.
- **Dev-mode noise that is not your bug.** One write per run can answer 500 with "Manifest file is empty" while a route is rebuilt, and concurrent writes can tear a JSON store because dev gives each route its own copy of the store module. Never load-test stores under `--dev`; use the default mode.
- **A sandbox by LAN address needs one more line.** `next dev` refuses its scripts to any origin but localhost, so the editor sticks on "Loading...". Add `allowedDevOrigins: ['<lan-ip>']` to the sandbox's own copy of `next.config.mjs` (never the repo's) and restart.
- **Calendar modules need a source id and a stub.** The household config sets `googleCalendarIds: ['primary']`; the events come from the `calendar` stub. The fixture's dates are fixed, so "today" can be empty; see `todayCalendarEvents()` in `e2e/helpers/api.ts` for events stamped to today.
- **Subagent testers** get one sandbox each, return findings as text, and are told the first trap word for word.

## What the sandbox shares and what it owns

| Shared with the checkout (read through links) | Private to the sandbox |
|---|---|
| Source, `.next` build, `node_modules`, static files in `public/` | `data/` (every store, secrets, tokens) |
| | `public/backgrounds/` (uploaded pictures) |
| | `server.log` |

Under `--dev`, `src/` is a private copy too, because the dev watcher does not follow a linked source folder.

The sandbox folder is always `<tmp>/hs-sandbox-hub/<port>`. It is never taken from the command line, so no argument can make `start` or `stop` delete anything else.
