import { fitModuleToDisplay } from './module-utils';
import { uuid } from '@/lib/uuid';
import type { ScreenConfiguration, Screen, Profile } from '@/types/config';
import type { LayoutExport } from '@/types/layout-export';
import { migrateScreens, getLatestSchemaVersion } from '@/lib/migrations';
import { screensWithOpenButtonsMoved, screensWithoutMissingOpenButtons } from '@/lib/display-filter';

// ── Export ───────────────────────────────────────────────────────────

interface ExportOptions {
  name?: string;
  description?: string;
  screenIds?: string[];
}

export function createLayoutExport(
  config: ScreenConfiguration,
  options: ExportOptions = {},
): LayoutExport {
  const {
    name = 'My Layout',
    description,
    screenIds,
  } = options;

  // Filter screens if a subset was requested
  const screens = screenIds
    ? config.screens.filter((s) => screenIds.includes(s.id))
    : config.screens;

  const selectedIds = new Set(screens.map((s) => s.id));

  // Only include profiles whose screens overlap with the export
  const profiles = (config.profiles ?? [])
    .map((p) => ({
      ...p,
      screenIds: p.screenIds.filter((sid) => selectedIds.has(sid)),
    }))
    .filter((p) => p.screenIds.length > 0);

  const moduleCount = screens.reduce((sum, s) => sum + s.modules.length, 0);

  return {
    _type: 'home-screens-layout',
    _version: 1,
    metadata: {
      name,
      description: description || undefined,
      exportedAt: new Date().toISOString(),
      configVersion: config.version,
      sourceDisplay: {
        width: config.settings.displayWidth,
        height: config.settings.displayHeight,
      },
      screenCount: screens.length,
      moduleCount,
    },
    visual: {
      rotationIntervalMs: config.settings.rotationIntervalMs,
      transitionEffect: config.settings.transitionEffect,
      transitionDuration: config.settings.transitionDuration,
    },
    screens,
    ...(profiles.length > 0 ? { profiles } : {}),
  };
}

// ── Import ──────────────────────────────────────────────────────────

interface ImportOptions {
  mode: 'add' | 'replace';
  applyVisual?: boolean;
  /**
   * The name for an imported screen whose own name is taken, in the
   * household's language: "Home (imported)", then "Home (imported 2)".
   * English when the caller has no translations to hand.
   */
  importedName?: (name: string, number?: number) => string;
}

export function importLayout(
  layout: LayoutExport,
  existingConfig: ScreenConfiguration,
  options: ImportOptions,
): ScreenConfiguration {
  const { mode, applyVisual = false } = options;
  const importedName = options.importedName
    ?? ((name: string, number?: number) => (number ? `${name} (imported ${number})` : `${name} (imported)`));

  // Modules exported under an older schema are migrated first: the merged
  // config already sits on the latest version, so nothing downstream would
  // ever repair them. A file that does not say which version wrote it is
  // taken as current (every export has recorded configVersion).
  const sourceVersion = layout.metadata?.configVersion;
  const sourceScreens = migrateScreens(
    layout.screens,
    typeof sourceVersion === 'number' && Number.isFinite(sourceVersion) ? sourceVersion : getLatestSchemaVersion(),
  );

  // Scale and clamp modules to fit the target display
  const source = { width: layout.metadata.sourceDisplay.width, height: layout.metadata.sourceDisplay.height };
  const target = { width: existingConfig.settings.displayWidth, height: existingConfig.settings.displayHeight };

  // Build an ID mapping: old → new for screens, modules, and profiles
  const screenIdMap = new Map<string, string>();
  const existingNames = new Set(
    mode === 'add' ? existingConfig.screens.map((s) => s.name) : [],
  );

  const newScreens: Screen[] = sourceScreens.map((screen) => {
    const newScreenId = uuid();
    screenIdMap.set(screen.id, newScreenId);

    // Resolve name conflicts
    let name = screen.name;
    if (existingNames.has(name)) {
      name = importedName(screen.name);
      // Handle unlikely double-conflict
      let counter = 2;
      while (existingNames.has(name)) {
        name = importedName(screen.name, counter);
        counter++;
      }
    }
    existingNames.add(name);

    return {
      ...screen,
      id: newScreenId,
      name,
      modules: screen.modules.map((m) => ({
        ...fitModuleToDisplay(m, source, target),
        id: uuid(),
      })),
    };
  });

  // An imported open button follows its screen when the file brought that
  // screen along. One whose screen stayed behind keeps working only when this
  // display already has that screen (your own export added back); otherwise
  // it is cleared, since a button to a missing screen fails every save.
  const screens = screensWithoutMissingOpenButtons([
    ...(mode === 'replace' ? [] : existingConfig.screens),
    ...screensWithOpenButtonsMoved(newScreens, screenIdMap),
  ]);

  // Profiles describe a whole layout, so only a replace brings them in.
  // Adding screens leaves the display's own profiles exactly as they were:
  // an imported profile keeps its schedule, and a scheduled one would take
  // the wall over from the screens that were already there, while importing
  // your own export again would duplicate every profile.
  const profiles = mode === 'replace'
    ? remapProfiles(layout.profiles ?? [], screenIdMap)
    : existingConfig.profiles;

  const baseSettings = applyVisual
    ? {
        ...existingConfig.settings,
        rotationIntervalMs: layout.visual.rotationIntervalMs,
        ...(layout.visual.transitionEffect !== undefined
          ? { transitionEffect: layout.visual.transitionEffect }
          : {}),
        ...(layout.visual.transitionDuration !== undefined
          ? { transitionDuration: layout.visual.transitionDuration }
          : {}),
      }
    : existingConfig.settings;

  // Clear stale activeProfile when replacing all screens/profiles
  const settings = mode === 'replace'
    ? { ...baseSettings, activeProfile: undefined }
    : baseSettings;

  return {
    ...existingConfig,
    settings,
    screens,
    profiles,
  };
}

/** The file's profiles with fresh ids, pointing at the imported screens. */
function remapProfiles(profiles: Profile[], screenIdMap: Map<string, string>): Profile[] | undefined {
  const remapped = profiles.map((p) => ({
    ...p,
    id: uuid(),
    screenIds: p.screenIds
      .map((sid) => screenIdMap.get(sid))
      .filter((id): id is string => !!id),
  }));
  return remapped.length > 0 ? remapped : undefined;
}

// ── Validation ──────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLayoutExport(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not an object'] };
  }

  const obj = data as Record<string, unknown>;

  if (obj._type !== 'home-screens-layout') {
    errors.push('Missing or invalid _type (expected "home-screens-layout")');
  }

  if (obj._version !== 1) {
    errors.push('Unsupported layout version');
  }

  if (!obj.metadata || typeof obj.metadata !== 'object') {
    errors.push('Missing metadata');
  } else {
    const meta = obj.metadata as Record<string, unknown>;
    if (!meta.name || typeof meta.name !== 'string') {
      errors.push('Missing metadata.name');
    }
  }

  if (!Array.isArray(obj.screens)) {
    errors.push('Missing or invalid screens array');
  } else {
    for (let i = 0; i < obj.screens.length; i++) {
      const screen = obj.screens[i] as Record<string, unknown>;
      if (!screen.id || typeof screen.id !== 'string') {
        errors.push(`Screen ${i}: missing id`);
      }
      if (!Array.isArray(screen.modules)) {
        errors.push(`Screen ${i}: missing modules array`);
      }
    }
  }

  if (!obj.visual || typeof obj.visual !== 'object') {
    errors.push('Missing visual settings');
  }

  return { valid: errors.length === 0, errors };
}

