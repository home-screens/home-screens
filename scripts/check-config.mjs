#!/usr/bin/env node

/**
 * Config validation CLI — checks data/config.json for structural problems.
 *
 * Usage:  npm run config:check
 *         node scripts/check-config.mjs [path/to/config.json]
 *
 * Exit codes:
 *   0 — all checks passed (may have warnings)
 *   1 — errors found
 *   2 — file not found or unparseable
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Known module types ──────────────────────────────────────────────────

// Keep in sync with BuiltinModuleType in src/types/config.ts — CLI can't import TS,
// but the TS validator uses an exhaustive Record<BuiltinModuleType, true> so that
// surface at least catches drift at compile time.
const BUILTIN_MODULE_TYPES = new Set([
  'clock', 'calendar', 'weather', 'countdown', 'dad-joke', 'text',
  'image', 'quote', 'todo', 'sticky-note', 'greeting', 'news',
  'stock-ticker', 'crypto', 'word-of-day', 'history', 'moon-phase',
  'sunrise-sunset', 'photo-slideshow', 'qr-code', 'year-progress',
  'traffic', 'sports', 'air-quality', 'todoist', 'rain-map',
  'multi-month', 'garbage-day', 'standings', 'affirmations', 'date',
  'display-control', 'meal-planner', 'iframe', 'chore-chart',
  'fullscreen-calendar', 'fullscreen-chore-chart',
  'fullscreen-meal-planner', 'fullscreen-photo',
]);

const LATEST_SCHEMA_VERSION = 3;

function isKnownModuleType(type) {
  return BUILTIN_MODULE_TYPES.has(type) || type.startsWith('plugin:');
}

// ── Validator ───────────────────────────────────────────────────────────

function validate(config) {
  const diags = [];

  // Top-level structure
  if (config.version == null) {
    diags.push({ severity: 'error', message: 'Missing required field "version"' });
  }
  if (config.settings == null || typeof config.settings !== 'object') {
    diags.push({ severity: 'error', message: 'Missing required field "settings"' });
  }
  if (!Array.isArray(config.screens)) {
    diags.push({ severity: 'error', message: 'Missing or invalid "screens" — expected an array' });
    return diags;
  }

  // Schema version
  if (typeof config.version === 'number' && config.version < LATEST_SCHEMA_VERSION) {
    diags.push({ severity: 'warning', message: `Schema version ${config.version} is outdated (latest: ${LATEST_SCHEMA_VERSION}). Run the app to auto-migrate.` });
  }

  // Settings
  if (config.settings) {
    const s = config.settings;
    if (s.displayWidth != null && s.displayWidth <= 0) {
      diags.push({ severity: 'error', message: `settings.displayWidth must be positive, got ${s.displayWidth}` });
    }
    if (s.displayHeight != null && s.displayHeight <= 0) {
      diags.push({ severity: 'error', message: `settings.displayHeight must be positive, got ${s.displayHeight}` });
    }
    if (s.rotationIntervalMs != null && s.rotationIntervalMs < 0) {
      diags.push({ severity: 'error', message: `settings.rotationIntervalMs must be non-negative, got ${s.rotationIntervalMs}` });
    }
    if (s.latitude === 0 && s.longitude === 0) {
      diags.push({ severity: 'warning', message: 'Latitude and longitude are both 0 — location-dependent modules will not work correctly' });
    }
    if (s.activeProfile && config.profiles) {
      const profileIds = new Set(config.profiles.map((p) => p.id));
      if (!profileIds.has(s.activeProfile)) {
        diags.push({ severity: 'warning', message: `settings.activeProfile "${s.activeProfile}" does not match any profile` });
      }
    }
  }

  // Screens
  const allScreenIds = new Set();
  validateScreenList(config.screens, 'screens', allScreenIds, diags);

  // Profiles
  if (config.profiles) {
    const seenProfileIds = new Set();
    for (const profile of config.profiles) {
      if (seenProfileIds.has(profile.id)) {
        diags.push({ severity: 'error', message: `Duplicate profile id "${profile.id}"` });
      }
      seenProfileIds.add(profile.id);
      for (const sid of profile.screenIds) {
        if (!allScreenIds.has(sid)) {
          diags.push({ severity: 'error', message: `Profile "${profile.name}" references unknown screen "${sid}"` });
        }
      }
    }
  }

  // Displays
  if (Array.isArray(config.displays)) {
    const slugRe = /^[a-z0-9][a-z0-9-]*$/;
    const seenDisplayIds = new Set();
    for (const display of config.displays) {
      if (!display.id || !slugRe.test(display.id) || display.id.length > 64) {
        diags.push({ severity: 'error', message: `Invalid display id "${display.id}": must be lowercase letters, digits, hyphens, max 64 chars` });
      } else if (seenDisplayIds.has(display.id)) {
        diags.push({ severity: 'error', message: `Duplicate display id "${display.id}"` });
      }
      seenDisplayIds.add(display.id);

      // Validate modules inside display-owned screens
      if (Array.isArray(display.screens)) {
        const displayScreenIds = new Set();
        validateScreenList(display.screens, `displays[${display.id}].screens`, displayScreenIds, diags);
      }
    }
    if (config.displays.length > 64) {
      diags.push({ severity: 'error', message: `Too many displays: ${config.displays.length} (max 64)` });
    }
  }

  return diags;
}

function validateScreenList(screens, pathPrefix, screenIdCollector, diags) {
  for (const screen of screens) {
    const label = `${pathPrefix}[${screen.id ?? '?'}]`;

    if (!screen.id) {
      diags.push({ severity: 'error', message: `${label}: screen is missing "id"` });
    } else {
      if (screenIdCollector.has(screen.id)) {
        diags.push({ severity: 'error', message: `${label}: duplicate screen id "${screen.id}"` });
      }
      screenIdCollector.add(screen.id);
    }

    if (!screen.name) {
      diags.push({ severity: 'error', message: `${label}: screen is missing "name"` });
    }

    if (Array.isArray(screen.modules)) {
      const seenModuleIds = new Set();
      for (const mod of screen.modules) {
        validateModule(mod, label, seenModuleIds, diags);
      }
    }
  }
}

function validateModule(mod, screenPath, seenModuleIds, diags) {
  const label = `${screenPath}.modules[${mod.id ?? '?'}]`;

  if (!mod.id) {
    diags.push({ severity: 'error', message: `${label}: module is missing "id"` });
  } else if (seenModuleIds.has(mod.id)) {
    diags.push({ severity: 'error', message: `${label}: duplicate module id "${mod.id}"` });
  }
  seenModuleIds.add(mod.id);

  if (!mod.type) {
    diags.push({ severity: 'error', message: `${label}: module is missing "type"` });
  } else if (!isKnownModuleType(mod.type)) {
    diags.push({ severity: 'error', message: `${label}: unknown module type "${mod.type}"` });
  }

  if (mod.position) {
    if (mod.position.x < 0 || mod.position.y < 0) {
      diags.push({ severity: 'error', message: `${label}: negative position (${mod.position.x}, ${mod.position.y})` });
    }
  }

  if (mod.size) {
    if (mod.size.w <= 0 || mod.size.h <= 0) {
      diags.push({ severity: 'error', message: `${label}: invalid size (${mod.size.w}x${mod.size.h}) — must be positive` });
    }
  }
}

// ── CLI entry point ─────────────────────────────────────────────────────

const configPath = process.argv[2] || resolve(process.cwd(), 'data', 'config.json');

if (!existsSync(configPath)) {
  console.log(`\x1b[33m⚠\x1b[0m  Config file not found: ${configPath}`);
  console.log('   This is normal for a fresh install — defaults will be created on first run.');
  process.exit(0);
}

let config;
try {
  const raw = readFileSync(configPath, 'utf-8');
  config = JSON.parse(raw);
} catch (err) {
  console.error(`\x1b[31m✗\x1b[0m  Failed to parse ${configPath}`);
  console.error(`   ${err.message}`);
  process.exit(2);
}

const diagnostics = validate(config);
const errors = diagnostics.filter((d) => d.severity === 'error');
const warnings = diagnostics.filter((d) => d.severity === 'warning');

if (diagnostics.length === 0) {
  const moduleCount = (config.screens || []).reduce((n, s) => n + (s.modules?.length || 0), 0);
  const screenCount = (config.screens || []).length;
  const displayCount = (config.displays || []).length;

  console.log(`\x1b[32m✓\x1b[0m  Config is valid`);
  console.log(`   Version: ${config.version}  |  ${screenCount} screen(s)  |  ${moduleCount} module(s)${displayCount ? `  |  ${displayCount} display(s)` : ''}`);
  process.exit(0);
}

for (const d of errors) {
  console.error(`\x1b[31m✗\x1b[0m  ${d.message}`);
}
for (const d of warnings) {
  console.warn(`\x1b[33m⚠\x1b[0m  ${d.message}`);
}

console.log(`\n   ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
