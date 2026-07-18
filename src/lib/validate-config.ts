/**
 * Config validation — pure function that checks a ScreenConfiguration for
 * structural problems and returns a list of diagnostics.
 *
 * Used by the `npm run config:check` CLI (scripts/check-config.ts).
 */

import type { ScreenConfiguration, Screen, ModuleInstance, BuiltinModuleType } from '@/types/config';
import { validateDisplays } from './display-filter';
import { getLatestSchemaVersion } from './migrations';
import { LOCALES } from '@/i18n/manifest';
import { logger } from '@/lib/logger';

const log = logger('config');

export interface ConfigDiagnostic {
  /** Machine-readable code, e.g. 'UNKNOWN_MODULE_TYPE'. */
  code: string;
  severity: 'error' | 'warning';
  /** Human-readable message. */
  message: string;
  /** Dot-path to the problematic location, e.g. 'screens[screen-1].modules[mod-1]'. */
  path?: string;
}

// Exhaustive record over BuiltinModuleType — TS errors if the union grows
// without adding the matching key, so this set stays aligned automatically.
const BUILTIN_MODULE_TYPE_MAP: Record<BuiltinModuleType, true> = {
  'clock': true, 'calendar': true, 'weather': true, 'countdown': true,
  'dad-joke': true, 'text': true, 'image': true, 'video': true, 'quote': true,
  'todo': true, 'sticky-note': true, 'greeting': true, 'news': true,
  'stock-ticker': true, 'crypto': true, 'word-of-day': true, 'history': true,
  'moon-phase': true, 'sunrise-sunset': true, 'photo-slideshow': true,
  'qr-code': true, 'year-progress': true, 'traffic': true, 'sports': true,
  'air-quality': true, 'todoist': true, 'rain-map': true, 'multi-month': true,
  'garbage-day': true, 'standings': true, 'affirmations': true, 'date': true,
  'display-control': true, 'meal-planner': true, 'iframe': true,
  'icon': true, 'shape': true,
  'chore-chart': true, 'fullscreen-calendar': true, 'fullscreen-chore-chart': true,
  'fullscreen-meal-planner': true, 'fullscreen-photo': true,
};
const BUILTIN_MODULE_TYPES: ReadonlySet<string> = new Set(Object.keys(BUILTIN_MODULE_TYPE_MAP));

function isKnownModuleType(type: string): boolean {
  return BUILTIN_MODULE_TYPES.has(type) || type.startsWith('plugin:');
}

// Latest schema version. Derived from migrations/index.ts so there's nothing
// to bump here — the latest migration's version wins.
const LATEST_SCHEMA_VERSION = getLatestSchemaVersion();

// Track whether we've already warned about an unknown locale this process —
// repeated `validateConfig` calls warning on every pass would be useless noise.
let UNKNOWN_LOCALE_WARNED = false;

/** @internal — for tests. Resets the warn-once latch. */
export function __resetUnknownLocaleWarningForTests(): void {
  UNKNOWN_LOCALE_WARNED = false;
}

/**
 * Validate a parsed ScreenConfiguration object. Returns an empty array when
 * the config is healthy.
 *
 * **Side effect — input mutation.** When `settings.locale` is set to an
 * unregistered tag, the field is cleared on the input object (`s.locale =
 * undefined`). This is intentional: it lets the runtime fall back to en-US
 * cleanly without rejecting an otherwise-valid config, and the editor can
 * round-trip the cleaned config straight back to disk. Callers that need
 * an unmutated input should clone before passing in. (Refactoring this
 * to return a cleaned copy would touch every caller plus the
 * config-check CLI; the current behavior is documented and isolated.)
 */
export function validateConfig(config: ScreenConfiguration): ConfigDiagnostic[] {
  const diags: ConfigDiagnostic[] = [];
  const raw = config as unknown as Record<string, unknown>;

  // ── Top-level structure ────────────────────────────────────────────

  if (raw.version == null) {
    diags.push({ code: 'MISSING_VERSION', severity: 'error', message: 'Missing required field "version"' });
  }

  if (raw.settings == null || typeof raw.settings !== 'object') {
    diags.push({ code: 'MISSING_SETTINGS', severity: 'error', message: 'Missing required field "settings"' });
  }

  if (!Array.isArray(raw.screens)) {
    diags.push({ code: 'MISSING_SCREENS', severity: 'error', message: 'Missing or invalid "screens" — expected an array' });
    // Can't validate further without screens
    return diags;
  }

  // ── Schema version ─────────────────────────────────────────────────

  if (typeof config.version === 'number' && config.version < LATEST_SCHEMA_VERSION) {
    diags.push({
      code: 'OUTDATED_VERSION',
      severity: 'warning',
      message: `Config schema version ${config.version} is outdated (latest: ${LATEST_SCHEMA_VERSION}). Run the app to auto-migrate.`,
    });
  }

  // ── Settings ───────────────────────────────────────────────────────

  if (config.settings) {
    const s = config.settings;

    if (s.displayWidth != null && s.displayWidth <= 0) {
      diags.push({ code: 'INVALID_DIMENSIONS', severity: 'error', message: `displayWidth must be positive, got ${s.displayWidth}`, path: 'settings.displayWidth' });
    }
    if (s.displayHeight != null && s.displayHeight <= 0) {
      diags.push({ code: 'INVALID_DIMENSIONS', severity: 'error', message: `displayHeight must be positive, got ${s.displayHeight}`, path: 'settings.displayHeight' });
    }
    if (s.rotationIntervalMs != null && s.rotationIntervalMs < 0) {
      diags.push({ code: 'INVALID_ROTATION_INTERVAL', severity: 'error', message: `rotationIntervalMs must be non-negative, got ${s.rotationIntervalMs}`, path: 'settings.rotationIntervalMs' });
    }
    if (s.latitude === 0 && s.longitude === 0) {
      diags.push({ code: 'LOCATION_NOT_SET', severity: 'warning', message: 'Latitude and longitude are both 0 — location-dependent modules (weather, sunrise, etc.) will not work correctly', path: 'settings' });
    }

    // Locale tag — drop unknown tags rather than rejecting the config.
    // The runtime falls back to en-US when `settings.locale` is undefined,
    // so clearing it is the friendliest behavior (the user can pick a real
    // locale from the editor without seeing a hard error first).
    //
    // NOTE: This mutates the caller's settings object (see the JSDoc on
    // `validateConfig` above). Documented + intentional.
    if (s.locale != null && !Object.prototype.hasOwnProperty.call(LOCALES, s.locale)) {
      if (!UNKNOWN_LOCALE_WARNED) {
        UNKNOWN_LOCALE_WARNED = true;
        log.warn(`Unknown locale "${s.locale}" — falling back to default. Pick one of: ${Object.keys(LOCALES).join(', ')}`);
      }
      s.locale = undefined;
    }

    // activeProfile reference
    if (s.activeProfile && config.profiles) {
      const profileIds = new Set(config.profiles.map((p) => p.id));
      if (!profileIds.has(s.activeProfile)) {
        diags.push({ code: 'ACTIVE_PROFILE_DANGLING', severity: 'warning', message: `activeProfile "${s.activeProfile}" does not match any profile`, path: 'settings.activeProfile' });
      }
    }
  }

  // ── Screens ────────────────────────────────────────────────────────

  const allScreenIds = new Set<string>();
  validateScreenList(config.screens, 'screens', allScreenIds, diags);

  // ── Profiles ───────────────────────────────────────────────────────

  if (config.profiles) {
    const seenProfileIds = new Set<string>();
    for (const profile of config.profiles) {
      if (seenProfileIds.has(profile.id)) {
        diags.push({ code: 'DUPLICATE_PROFILE_ID', severity: 'error', message: `Duplicate profile id "${profile.id}"`, path: `profiles[${profile.id}]` });
      }
      seenProfileIds.add(profile.id);

      for (const sid of profile.screenIds) {
        if (!allScreenIds.has(sid)) {
          diags.push({ code: 'PROFILE_DANGLING_SCREEN', severity: 'error', message: `Profile "${profile.name}" references unknown screen "${sid}"`, path: `profiles[${profile.id}].screenIds` });
        }
      }
    }
  }

  // ── Displays (delegates to existing validateDisplays) ──────────────

  if (config.displays) {
    const displayError = validateDisplays(config);
    if (displayError) {
      diags.push({ code: 'DISPLAY_INVALID', severity: 'error', message: displayError, path: 'displays' });
    }

    // Also validate modules inside display-owned screens
    for (const display of config.displays) {
      if (display.screens) {
        const displayScreenIds = new Set<string>();
        validateScreenList(display.screens, `displays[${display.id}].screens`, displayScreenIds, diags);
      }
    }
  }

  return diags;
}

/** Validate a list of screens (shared between top-level and display-owned). */
function validateScreenList(
  screens: Screen[],
  pathPrefix: string,
  screenIdCollector: Set<string>,
  diags: ConfigDiagnostic[],
): void {
  for (const screen of screens) {
    const screenPath = `${pathPrefix}[${screen.id ?? '?'}]`;

    if (!screen.id) {
      diags.push({ code: 'SCREEN_MISSING_ID', severity: 'error', message: 'Screen is missing "id"', path: screenPath });
    } else {
      if (screenIdCollector.has(screen.id)) {
        diags.push({ code: 'DUPLICATE_SCREEN_ID', severity: 'error', message: `Duplicate screen id "${screen.id}"`, path: screenPath });
      }
      screenIdCollector.add(screen.id);
    }

    if (!screen.name) {
      diags.push({ code: 'SCREEN_MISSING_NAME', severity: 'error', message: `Screen "${screen.id ?? '?'}" is missing "name"`, path: screenPath });
    }

    if (screen.rotationDurationMs != null) {
      const d = screen.rotationDurationMs;
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (!Number.isInteger(d) || d < 0 || d > ONE_DAY_MS) {
        diags.push({
          code: 'INVALID_SCREEN_ROTATION_DURATION',
          severity: 'error',
          message: `Screen "${screen.id ?? '?'}" rotationDurationMs must be a non-negative integer ≤ ${ONE_DAY_MS} ms, got ${d}`,
          path: `${screenPath}.rotationDurationMs`,
        });
      }
    }

    if (Array.isArray(screen.modules)) {
      const seenModuleIds = new Set<string>();
      for (const mod of screen.modules) {
        validateModule(mod, screenPath, seenModuleIds, diags);
      }
    }
  }
}

/** Validate a single module instance. */
function validateModule(
  mod: ModuleInstance,
  screenPath: string,
  seenModuleIds: Set<string>,
  diags: ConfigDiagnostic[],
): void {
  const modPath = `${screenPath}.modules[${mod.id ?? '?'}]`;

  if (!mod.id) {
    diags.push({ code: 'MODULE_MISSING_ID', severity: 'error', message: 'Module is missing "id"', path: modPath });
  } else {
    if (seenModuleIds.has(mod.id)) {
      diags.push({ code: 'DUPLICATE_MODULE_ID', severity: 'error', message: `Duplicate module id "${mod.id}" in screen`, path: modPath });
    }
    seenModuleIds.add(mod.id);
  }

  if (!mod.type) {
    diags.push({ code: 'MODULE_MISSING_TYPE', severity: 'error', message: `Module "${mod.id ?? '?'}" is missing "type"`, path: modPath });
  } else if (!isKnownModuleType(mod.type)) {
    diags.push({ code: 'UNKNOWN_MODULE_TYPE', severity: 'error', message: `Unknown module type "${mod.type}"`, path: modPath });
  }

  if (mod.position) {
    if (mod.position.x < 0 || mod.position.y < 0) {
      diags.push({ code: 'INVALID_MODULE_POSITION', severity: 'error', message: `Module "${mod.id ?? '?'}" has negative position (${mod.position.x}, ${mod.position.y})`, path: modPath });
    }
  }

  if (mod.size) {
    if (mod.size.w <= 0 || mod.size.h <= 0) {
      diags.push({ code: 'INVALID_MODULE_SIZE', severity: 'error', message: `Module "${mod.id ?? '?'}" has invalid size (${mod.size.w}x${mod.size.h}) — must be positive`, path: modPath });
    }
  }
}
