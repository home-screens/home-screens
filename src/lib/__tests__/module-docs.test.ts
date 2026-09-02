import { describe, it, expect } from 'vitest';
import { MODULE_DOCS_ANCHOR, moduleDocsUrl } from '@/lib/module-docs';
import { getAllModuleDefinitions } from '@/lib/module-registry';

describe('module docs anchors', () => {
  it('maps every built-in module type to a docs anchor', () => {
    const missing = getAllModuleDefinitions()
      .map((d) => d.type)
      .filter((type) => !type.startsWith('plugin:'))
      .filter((type) => !(type in MODULE_DOCS_ANCHOR));
    expect(missing).toEqual([]);
  });

  it('maps no type the registry does not have', () => {
    const known = new Set(getAllModuleDefinitions().map((d) => d.type));
    expect(Object.keys(MODULE_DOCS_ANCHOR).filter((t) => !known.has(t as never))).toEqual([]);
  });

  it('has no duplicate anchors', () => {
    const anchors = Object.values(MODULE_DOCS_ANCHOR);
    expect(anchors.length).toBe(new Set(anchors).size);
  });

  it('returns null for plugin modules', () => {
    expect(moduleDocsUrl('plugin:strava' as never)).toBeNull();
  });

  it('deep links to the module reference', () => {
    expect(moduleDocsUrl('garbage-day')).toBe('https://homescreens.dev/docs/module-reference#garbage-day');
  });
});
