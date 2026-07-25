import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import {
  SETTINGS_FIELD_INDEX,
  isSettingsFieldReachable,
  type SettingsFieldVisibilityContext,
} from '@/lib/settings-search-index';
import { DEFAULT_PAGE_IDS, validPanelFor, type DefaultPageId } from '@/lib/settings-route';
import { WEATHER_PROVIDERS } from '@/components/editor/settings/weather/providers';
import { FORM_DEFAULTS } from '@/lib/settings-form';

/**
 * `SETTINGS_FIELD_INDEX` links a search result to a DOM element by matching
 * `fieldId` against a `data-field-id` attribute at runtime. Both sides are
 * free strings with no compile-time relationship, so a rename on either side
 * produces a search result that navigates, polls for three seconds, and gives
 * up with no feedback — the same dead end as an unreachable field, from a
 * different cause. Nothing caught that, and this list churned twice during the
 * settings reorganization.
 *
 * These scan the component sources rather than rendering every settings page:
 * the pages fetch their own data and gate large parts of their markup, so a
 * render-based check would need extensive mocking and would still only cover
 * whichever branch the mocks happened to select. The attribute is what the
 * runtime looks for, so the attribute is what gets asserted.
 */

const COMPONENTS_DIR = path.join(process.cwd(), 'src', 'components');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `fieldId={`prefix.${…}`}` template site found in the components. */
const templateAnchorSites: { file: string; prefix: string }[] = [];

/**
 * Every field id the components can produce.
 *
 * Three shapes exist:
 *   1. the attribute written literally,
 *   2. a `fieldId="..."` prop threaded into a wrapper that renders
 *      `data-field-id={fieldId}`,
 *   3. a template literal built from a data source (today only the weather
 *      provider cards).
 *
 * The template case is expanded from its REAL source list rather than matched
 * by prefix, so a typo'd or removed provider id still fails.
 */
const anchoredFieldIds: Set<string> = (() => {
  const ids = new Set<string>();
  for (const file of walk(COMPONENTS_DIR)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/data-field-id="([^"]+)"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/\bfieldId="([^"]+)"/g)) ids.add(m[1]);
    for (const m of src.matchAll(/\bfieldId=\{`([^`$]*)\$\{/g)) {
      templateAnchorSites.push({ file: path.relative(process.cwd(), file), prefix: m[1] });
    }
  }
  for (const provider of WEATHER_PROVIDERS) {
    ids.add(`weather.provider.${provider.id}`);
  }
  return ids;
})();

describe('SETTINGS_FIELD_INDEX anchors', () => {
  it('finds at least as many anchors in the components as the index declares', () => {
    // Guards the scan itself: a refactor that changed how the attribute is
    // written would otherwise make every assertion below vacuously pass by
    // finding nothing at all.
    expect(anchoredFieldIds.size).toBeGreaterThanOrEqual(SETTINGS_FIELD_INDEX.length);
  });

  it.each(SETTINGS_FIELD_INDEX.map((f) => [f.fieldId, f] as const))(
    '%s resolves to a data-field-id anchor in a component',
    (fieldId) => {
      expect(anchoredFieldIds.has(fieldId)).toBe(true);
    },
  );

  it('has exactly the template-built anchor sites this test knows how to expand', () => {
    // The scan can only expand a template whose source list it imports. A new
    // dynamic anchor site would otherwise be invisible to the check above, so
    // fail loudly here and force whoever adds one to teach the test about it.
    expect(templateAnchorSites.map((s) => s.prefix).sort()).toEqual(['weather.provider.']);
  });

  it('declares a live page id for every entry', () => {
    const livePages = new Set<string>(DEFAULT_PAGE_IDS);
    for (const entry of SETTINGS_FIELD_INDEX) {
      expect(livePages.has(entry.pageId)).toBe(true);
    }
  });

  it('declares a panel that its page actually renders, or none at all', () => {
    for (const entry of SETTINGS_FIELD_INDEX) {
      if (!entry.panel) continue;
      // A panel the destination page does not own would be dropped by the
      // route canonicalizer, landing the search result on the default tab.
      expect(validPanelFor(entry.pageId as DefaultPageId, entry.panel)).toBe(entry.panel);
    }
  });

  it('has no duplicate field ids', () => {
    const seen = new Set<string>();
    for (const entry of SETTINGS_FIELD_INDEX) {
      expect(seen.has(entry.fieldId), `duplicate ${entry.fieldId}`).toBe(false);
      seen.add(entry.fieldId);
    }
  });
});

describe('conditionally-rendered field gating', () => {
  const DEFAULT_INSTALL: SettingsFieldVisibilityContext = {
    advancedMode: false,
    isMultiDisplay: false,
    profileCount: 0,
    transitionEffect: 'fade',
  };

  it('hides advanced-mode-only fields on a default install', () => {
    // Nothing on the destination page lets the user reveal these, so offering
    // them is a guaranteed dead end.
    for (const fieldId of ['integrations.github', 'system.updateChannel']) {
      const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === fieldId)!;
      expect(entry, `${fieldId} missing from the index`).toBeDefined();
      expect(isSettingsFieldReachable(entry, DEFAULT_INSTALL)).toBe(false);
      expect(isSettingsFieldReachable(entry, { ...DEFAULT_INSTALL, advancedMode: true })).toBe(true);
    }
  });

  it('hides canvas geometry fields on a multi-display install', () => {
    // In multi-display mode each DisplayNode owns its own geometry, so the
    // global fields are not rendered on the Screen page at all.
    for (const fieldId of ['display.canvasOrientation', 'display.canvasResolution', 'display.canvasFlip']) {
      const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === fieldId)!;
      expect(isSettingsFieldReachable(entry, DEFAULT_INSTALL)).toBe(true);
      expect(isSettingsFieldReachable(entry, { ...DEFAULT_INSTALL, isMultiDisplay: true })).toBe(false);
    }
  });

  it('hides the active-profile picker until a profile exists', () => {
    const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === 'profiles.activeProfile')!;
    expect(isSettingsFieldReachable(entry, DEFAULT_INSTALL)).toBe(false);
    expect(isSettingsFieldReachable(entry, { ...DEFAULT_INSTALL, profileCount: 2 })).toBe(true);
  });

  it('hides transition duration when no transition is selected', () => {
    const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === 'display.transitionDuration')!;
    expect(isSettingsFieldReachable(entry, DEFAULT_INSTALL)).toBe(true);
    expect(isSettingsFieldReachable(entry, { ...DEFAULT_INSTALL, transitionEffect: 'none' })).toBe(false);
  });

  it('keeps transition duration reachable when the setting is unset', () => {
    // `transitionEffect` is optional in GlobalSettings, and the page resolves an
    // unset value through FORM_DEFAULTS ('fade') — so the field DOES render.
    // A caller defaulting it to 'none' instead would hide a visible field from
    // search, which is the same dead end this gating exists to prevent, only
    // inverted and harder to notice.
    const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === 'display.transitionDuration')!;
    const asPageResolvesIt = FORM_DEFAULTS.display.transitionEffect;
    expect(isSettingsFieldReachable(entry, { ...DEFAULT_INSTALL, transitionEffect: asPageResolvesIt })).toBe(true);
  });

  it('resolves an unset transitionEffect to something that renders the field', () => {
    // Pins the shared assumption itself: if FORM_DEFAULTS ever changed to
    // 'none', the gate above would start hiding a field the page still shows.
    expect(FORM_DEFAULTS.display.transitionEffect).not.toBe('none');
  });

  it('leaves unconditional fields reachable in every context', () => {
    const entry = SETTINGS_FIELD_INDEX.find((f) => f.fieldId === 'location.timezone')!;
    expect(isSettingsFieldReachable(entry, DEFAULT_INSTALL)).toBe(true);
    expect(
      isSettingsFieldReachable(entry, {
        advancedMode: true, isMultiDisplay: true, profileCount: 5, transitionEffect: 'none',
      }),
    ).toBe(true);
  });
});
