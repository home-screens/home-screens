import { v4 as uuidv4 } from 'uuid';
import type { ScreenConfiguration, Screen, Profile, ModuleInstance } from '@/types/config';
import type { LayoutExport } from '@/types/layout-export';

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
}

export function importLayout(
  layout: LayoutExport,
  existingConfig: ScreenConfiguration,
  options: ImportOptions,
): ScreenConfiguration {
  const { mode, applyVisual = false } = options;

  // Scale and clamp modules to fit the target display
  const srcW = layout.metadata.sourceDisplay.width;
  const srcH = layout.metadata.sourceDisplay.height;
  const tgtW = existingConfig.settings.displayWidth;
  const tgtH = existingConfig.settings.displayHeight;
  const needsScale = srcW !== tgtW || srcH !== tgtH;

  function scaleModule(m: ModuleInstance): ModuleInstance {
    if (!needsScale) return m;
    const MIN_SIZE = 60;
    const scaleX = tgtW / srcW;
    const scaleY = tgtH / srcH;

    let w = Math.max(MIN_SIZE, Math.round(m.size.w * scaleX));
    let h = Math.max(MIN_SIZE, Math.round(m.size.h * scaleY));
    let x = Math.round(m.position.x * scaleX);
    let y = Math.round(m.position.y * scaleY);

    // Clamp size to display bounds
    w = Math.min(w, tgtW);
    h = Math.min(h, tgtH);
    // Clamp position so the module stays fully on-canvas
    x = Math.max(0, Math.min(x, tgtW - w));
    y = Math.max(0, Math.min(y, tgtH - h));

    return { ...m, position: { x, y }, size: { w, h } };
  }

  // Build an ID mapping: old → new for screens, modules, and profiles
  const screenIdMap = new Map<string, string>();
  const existingNames = new Set(
    mode === 'add' ? existingConfig.screens.map((s) => s.name) : [],
  );

  const newScreens: Screen[] = layout.screens.map((screen) => {
    const newScreenId = uuidv4();
    screenIdMap.set(screen.id, newScreenId);

    // Resolve name conflicts
    let name = screen.name;
    if (existingNames.has(name)) {
      name = `${name} (imported)`;
      // Handle unlikely double-conflict
      let counter = 2;
      while (existingNames.has(name)) {
        name = `${screen.name} (imported ${counter})`;
        counter++;
      }
    }
    existingNames.add(name);

    return {
      ...screen,
      id: newScreenId,
      name,
      modules: screen.modules.map((m) => ({
        ...scaleModule(m),
        id: uuidv4(),
      })),
    };
  });

  // Remap profile screenIds
  const newProfiles: Profile[] = (layout.profiles ?? []).map((p) => ({
    ...p,
    id: uuidv4(),
    screenIds: p.screenIds
      .map((sid) => screenIdMap.get(sid))
      .filter((id): id is string => !!id),
  }));

  const screens =
    mode === 'replace' ? newScreens : [...existingConfig.screens, ...newScreens];

  const profiles =
    mode === 'replace'
      ? newProfiles.length > 0 ? newProfiles : undefined
      : [...(existingConfig.profiles ?? []), ...newProfiles].length > 0
        ? [...(existingConfig.profiles ?? []), ...newProfiles]
        : undefined;

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

