import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFetch, mockFetchError } from '@/test-utils';
import {
  getDisplayOrientation,
  loadTemplate,
  TEMPLATE_CATALOG,
  TEMPLATE_CATEGORIES,
} from '@/lib/templates';
import type { TemplateMeta } from '@/lib/templates';
import { getAllModuleDefinitions } from '@/lib/module-registry';

// ---------------------------------------------------------------------------
// getDisplayOrientation
// ---------------------------------------------------------------------------
describe('getDisplayOrientation', () => {
  it('returns portrait when height > width', () => {
    expect(getDisplayOrientation(1080, 1920)).toBe('portrait');
  });

  it('returns landscape when width > height', () => {
    expect(getDisplayOrientation(1920, 1080)).toBe('landscape');
  });

  it('returns landscape when width === height', () => {
    // Code: width >= height → landscape
    expect(getDisplayOrientation(1080, 1080)).toBe('landscape');
  });

  it('handles very small dimensions', () => {
    expect(getDisplayOrientation(1, 2)).toBe('portrait');
    expect(getDisplayOrientation(2, 1)).toBe('landscape');
  });
});

// ---------------------------------------------------------------------------
// loadTemplate
// ---------------------------------------------------------------------------
describe('loadTemplate', () => {
  const template: TemplateMeta = {
    id: 'test-template',
    name: 'Test',
    description: 'A test template',
    category: 'Dashboard',
    portrait: 'test-portrait.json',
    landscape: 'test-landscape.json',
    screenCount: 1,
    moduleTypes: ['clock'],
  };

  const fakeLayoutExport = {
    _type: 'home-screens-layout',
    _version: 1,
    metadata: { name: 'Test', exportedAt: '2026-01-01', configVersion: 1, sourceDisplay: { width: 1080, height: 1920 }, screenCount: 1, moduleCount: 1 },
    visual: { rotationIntervalMs: 30000 },
    screens: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects portrait filename when orientation is portrait', async () => {
    mockFetch(fakeLayoutExport);

    await loadTemplate(template, 'portrait');

    expect(global.fetch).toHaveBeenCalledWith('/templates/test-portrait.json');
  });

  it('selects landscape filename when orientation is landscape', async () => {
    mockFetch(fakeLayoutExport);

    await loadTemplate(template, 'landscape');

    expect(global.fetch).toHaveBeenCalledWith('/templates/test-landscape.json');
  });

  it('returns parsed JSON on success', async () => {
    mockFetch(fakeLayoutExport);

    const result = await loadTemplate(template, 'portrait');

    expect(result).toEqual(fakeLayoutExport);
  });

  it('throws on fetch failure with status code in message', async () => {
    mockFetchError(404);

    await expect(loadTemplate(template, 'portrait')).rejects.toThrow(
      'Failed to load template: 404',
    );
  });

  it('throws on fetch failure with 500 status', async () => {
    mockFetchError(500);

    await expect(loadTemplate(template, 'landscape')).rejects.toThrow(
      'Failed to load template: 500',
    );
  });
});

// ---------------------------------------------------------------------------
// TEMPLATE_CATALOG data integrity
// ---------------------------------------------------------------------------
describe('TEMPLATE_CATALOG data integrity', () => {
  // Build the set of valid module types from the registry (source of truth)
  const validModuleTypes = new Set<string>(
    getAllModuleDefinitions().map((d) => d.type),
  );

  // Build valid categories excluding 'All' (display-only filter, not a real category)
  const validCategories = new Set<string>(
    TEMPLATE_CATEGORIES.filter((c) => c !== 'All'),
  );

  it('has at least one template', () => {
    expect(TEMPLATE_CATALOG.length).toBeGreaterThan(0);
  });

  it('all template IDs are unique', () => {
    const ids = TEMPLATE_CATALOG.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all templates have both portrait and landscape filenames', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.portrait, `${t.id}: missing portrait filename`).toBeTruthy();
      expect(t.landscape, `${t.id}: missing landscape filename`).toBeTruthy();
      expect(t.portrait, `${t.id}: portrait should end in .json`).toMatch(/\.json$/);
      expect(t.landscape, `${t.id}: landscape should end in .json`).toMatch(/\.json$/);
    }
  });

  it('all templates reference only valid ModuleType values', () => {
    for (const t of TEMPLATE_CATALOG) {
      for (const mt of t.moduleTypes) {
        expect(
          validModuleTypes.has(mt),
          `Template "${t.id}" references unknown module type "${mt}"`,
        ).toBe(true);
      }
    }
  });

  it('every template moduleTypes array is non-empty', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(
        t.moduleTypes.length,
        `Template "${t.id}" has no module types listed`,
      ).toBeGreaterThan(0);
    }
  });

  it('all template categories are in TEMPLATE_CATEGORIES', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(
        validCategories.has(t.category),
        `Template "${t.id}" has invalid category "${t.category}"`,
      ).toBe(true);
    }
  });

  it('screenCount is a positive integer for all templates', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.screenCount, `${t.id}: screenCount should be positive`).toBeGreaterThan(0);
      expect(Number.isInteger(t.screenCount), `${t.id}: screenCount should be an integer`).toBe(true);
    }
  });

  it('portrait and landscape filenames differ for every template', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(
        t.portrait,
        `Template "${t.id}" has identical portrait and landscape filenames`,
      ).not.toBe(t.landscape);
    }
  });

  it('all template names are non-empty strings', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.name.trim().length, `${t.id}: name should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('all template descriptions are non-empty strings', () => {
    for (const t of TEMPLATE_CATALOG) {
      expect(t.description.trim().length, `${t.id}: description should be non-empty`).toBeGreaterThan(0);
    }
  });
});
