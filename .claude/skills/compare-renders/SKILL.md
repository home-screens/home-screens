---
name: compare-renders
description: "Prove a visual regression or verify a visual fix with before/after screenshots of the real app: production builds of two trees (main and a branch, or a build before and after a change) run side by side from data-isolated sandboxes, the same seeded config on both, one Playwright pass that screenshots and measures computed styles, then an annotated HTML gallery. Triggers on: 'create screenshots of the issue', 'show me before and after', 'render this on main and on the branch', 'prove the regression in the real UI', 'compare renders', 'make a gallery of the fix'. Repo-specific to home-screens (uses its display route, E2E fixtures and data-path conventions)."
---

# Compare Renders

## Overview

A claim that a change altered how something renders carries weight only when the reader can see it in the real app, on the same config, before and after. This skill produces that: two production servers (main and the branch) started from sandboxes that share the build but own a private `data/`, one script that loads the same display screen on each, screenshots it, crops single elements at 3x, and records the computed styles, and a static gallery page with the differences boxed and labelled.

Synthetic CSS repros are a fine first check, but the deliverable is the real render. The gallery goes to `.claude/mockups/<name>/index.html` and is opened in the browser (the user does not look at attached files).

**Announce at start:** "I'll render this on main and on the branch from the real app and build a side-by-side gallery."

## Prerequisites

- Playwright's Chromium, installed once with `npx playwright install chromium`. Both `.mjs` scripts and the Step 6 gallery check launch it.
- Memory for a second production build. The branch build below runs with `NODE_OPTIONS='--max-old-space-size=3072'`; lower it if the machine is tight, or build the two trees one after the other instead of side by side.
- Two free local ports. The examples use 3131 and 3132 throughout, but nothing depends on those numbers; pass any two ports to `hub.sh` and put the same ones in the job file.
- The `version` in `templates/example-config.json` must equal the current schema version, which is the highest `vN-to-vM` file in `src/lib/migrations/`. Bump it when a migration lands; a stale value makes the server migrate the config on read.

## Scripts (in `scripts/`, run from the repo root)

- The servers come from the `sandbox-hub` skill's launcher, `.claude/skills/sandbox-hub/scripts/hub.sh` (called `hub.sh` below). `hub.sh start <port> --root <tree> --config <config.json> [--assets <dir>]` mirrors a built tree into a private sandbox, copies any test pictures from the assets folder into its `public/backgrounds/` (reference them as `/backgrounds/<file>`), and starts `next start` there; it prints the base URL once `/login` answers. `hub.sh stop <port>` stops it and deletes the sandbox, and `hub.sh path <port>` prints the sandbox folder.
- `shoot.mjs <job.json>` screenshots and measures every screen in the job on every server in the job; writes PNGs and `measurements.json` to the job's `out` directory.
- `measure.mjs <image.png> [--column 0.4] [--threshold 200] [--dark]` scans one column of a PNG and prints runs of light (or dark) rows as `[first, last, top%, height%]`, which is what the gallery callouts take.
- `templates/example-config.json` and `templates/example-job.json` are a complete, working input pair (two weather modules on a portrait display, temperature measured), ready to copy and edit.
- `templates/gallery.html` is the page skeleton: two-column pairs, percentage-positioned red boxes for defects, green for the matching spot on the good side.

The two `.mjs` scripts import `@playwright/test`; they resolve it because they sit inside the repo. Do not copy them to a temp directory.

## Process

### Step 1: Two production builds

Production, not dev: the display page does not hydrate under `next dev` in a sandboxed directory, so nothing fetches and no module renders. Symptom: the server-rendered empty state ("No events this month"), zero `/api/` requests, `[data-module-id]` with no React fiber keys.

- Main: `npm run build` in the checkout if `.next/BUILD_ID` is older than the commits that matter. A build that predates unrelated merges is fine as a baseline.
- Branch: `git worktree add <scratch>/wt origin/<branch>`, then `rm -rf node_modules && cp -Rc <repo>/node_modules node_modules` inside the worktree (APFS clone, about 8s; a symlinked `node_modules` breaks the build), then `NODE_OPTIONS='--max-old-space-size=3072' npx next build`. Remove the worktree with `git worktree remove --force` when done.

### Step 2: One config that exposes the case

Mirror `baseConfig` from `e2e/helpers/config-fixtures.ts` (version = the current schema version, see Prerequisites; telemetry off, 1h rotation) and add:

- The display shape that shows the problem. Landscape is `displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal'`; portrait is `1080 x 1920` with `'90'`.
- One screen per module under test, so each is reachable as `/display?screen=<screenId>`. A module's `config` must carry every registry default it reads (copy from `defaultConfig` in `src/lib/module-registry.ts`), the `style` block is `DEFAULT_MODULE_STYLE` from `src/types/config.ts`.
- Whatever makes the module render the state under test: the view under review, a location for location-bound modules (the example config uses Boulder, CO), a rule that matches everything if rules are involved.
- A source so the module does not show its "nothing set up yet" empty state. For calendars that is `settings.calendar.googleCalendarIds: ['primary']`; the data itself comes from a browser-side stub (Step 4), never from the server.

Write the same file into both sandboxes. To change it later, rewrite `data/config.json` in each sandbox (`hub.sh path <port>` prints the folder) and wait 2s (the config read has a short cache); no restart needed.

### Step 3: Start both servers

```
.claude/skills/sandbox-hub/scripts/hub.sh start 3131 --config <scratch>/config.json
.claude/skills/sandbox-hub/scripts/hub.sh start 3132 --root <scratch>/wt --config <scratch>/config.json
```

Sandboxes symlink every top-level entry except `data/` and `public/` (private, so uploads and writes never reach the real ones), `public/` gets its children linked individually with an empty local `backgrounds/`, and the server runs with the sandbox as cwd and `HOME_SCREENS_DIR` unset, which is the whole isolation (data paths resolve through cwd). No `auth.json` means no password and no login.

Files dropped into a sandbox's `public/` after boot return 404 until that server restarts: Next lists `public/` once at startup. Pass test pictures with `--assets` so they are in place before the server starts.

### Step 4: Shoot

Write a job file and run `node scripts/shoot.mjs job.json`. Per shot: `screen` id, a `waitFor` selector that only exists once the module rendered (`[data-module-id="w-current"] >> text=/72°/` waits for stubbed data to land; a `data-` attribute the module sets works too), `crops` (a selector, `nth` when it matches many, `parent: true` to crop the containing element, `pad` in CSS px) and `measure` entries (the element, an optional `child`, and the computed-style props to record). `stubs` map a route glob to a fixture file, fulfilled in the browser like `stubModuleData` does in E2E; `e2e/fixtures/module-data/` has one per data module. Selectors are Playwright locator strings, so `>> text=/.../` and `nth` work.

The measurements are the numbers for the gallery table: a computed value on main against a different one on the branch is the claim in the browser's own words, and the element's box size plus aspect turns it into a pixel count.

### Step 5: Locate the difference precisely

Run `measure.mjs` on the branch crop to get the row range of a band (a gap, a strip, a shifted block) as percentages of the image, and on the main crop to confirm it reads differently there. Use `--dark` with a low threshold when the defect is a dark band on a light image; pick `--column` so the scan line crosses the defect and nothing else. If a difference is real but invisible (a 2px shift in a dark theme), say so in the gallery and let the measurement carry it; do not draw a box around nothing.

### Step 6: Build and open the gallery

Copy `templates/gallery.html` to `.claude/mockups/<name>/index.html` next to the PNGs. For every figure:

- A **Where:** line that tells the reader the spot in words before they look at the boxes.
- A red `.mark` + `.tag` on each defect, positioned with the percentages from Step 5, labelled with the measured size.
- A green `.mark.ok` + `.tag.ok` on the same spot on the good side, saying what is there instead.
- A table up top with box size, aspect, the computed value on each side, and the resulting pixel difference.
- A closing "Why it happens" paragraph with the mechanism and the fix.

Then `open .claude/mockups/<name>/index.html`, and render the page once with Playwright and look at a crop of it to confirm the boxes sit on the right spots. Link the gallery from wherever the finding is written up (a review, an issue, a PR comment).

### Step 7: Clean up

`hub.sh stop 3131` and `3132`, remove the worktree, delete any scratch scripts. The gallery and the report stay.

## Traps

- **Dev server sandbox never hydrates the display.** Use production builds. Half an hour was lost to this once.
- **`pkill -f "next start"` does not free the port.** The `next-server` child survives and keeps serving the old build, so a "restart" changes nothing. `hub.sh stop` kills by port for this reason.
- **`public/` is scanned at boot.** New test assets need a restart.
- **Calendar modules empty out without a source id.** `googleCalendarIds: ['primary']` plus the stub; an empty `icalSources` alone renders "No calendars picked yet".
- **Main's `.next` may be stale.** Check `.next/BUILD_ID` mtime against the commits that touch the code under test.
- **Do not put scratch Playwright scripts outside the repo.** `@playwright/test` resolves from the script's directory upward.

## Worked example: did the weather module's temperature change size?

A layout change to the weather module is supposed to leave the current temperature alone. The example inputs check that on the real display.

Config (`templates/example-config.json`): 1080x1920 portrait, one screen `s-weather` with two `weather` modules, `w-current` in the `current` view at 640x360 and `w-daily` in the `daily` view at 920x520, a location set so the modules are not in their "needs a location" state, and the registry defaults for every other field.

Job (`templates/example-job.json`):

```json
{
  "out": ".claude/mockups/<name>",
  "servers": { "main": "http://127.0.0.1:3131", "branch": "http://127.0.0.1:3132" },
  "viewport": { "width": 1080, "height": 1920 },
  "scale": 3,
  "stubs": { "**/api/weather*": "e2e/fixtures/module-data/weather.json" },
  "shots": [{
    "screen": "s-weather",
    "waitFor": "[data-module-id=\"w-current\"] >> text=/72°/",
    "crops": [
      { "name": "current", "selector": "[data-module-id=\"w-current\"]", "pad": 8 },
      { "name": "daily", "selector": "[data-module-id=\"w-daily\"]", "pad": 8 }
    ],
    "measure": [
      { "name": "temp", "selector": "[data-module-id=\"w-current\"] >> text=/^72°/", "props": ["fontSize", "fontWeight", "lineHeight"] },
      { "name": "daily-box", "selector": "[data-module-id=\"w-daily\"]", "props": ["padding"] }
    ]
  }]
}
```

The weather stub serves 72° for the current conditions, so `waitFor` waits for the fetched data, not just the module shell. Reading the output: `measurements.json` gives the temperature's box and computed font size on each server (on main today: a 207x127 box at 127px, weight 300). If both sides agree, the crops should scan identically with `measure.mjs`. If they differ, the two font sizes are the claim, the crops show it, and `measure.mjs` on the current-conditions crop (with `--dark` and a `--column` through the digits) gives the row range of the digits on each side for the callouts.
