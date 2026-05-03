import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildIconClass,
  pickStyleForIcon,
  searchFullCatalog,
  FA_ICONS,
  type FaIconEntry,
  type FaIconKind,
} from '@/lib/font-awesome-icons';
// Functions accessed via `await import(...)` after `vi.resetModules()` are
// loaded inside individual tests so each gets a fresh module-level cache.

// `entriesFromManifest` is internal — exercise it via `loadAllFaIcons` against
// a stubbed fetch response so the merge with the curated `FA_ICONS` is covered.

describe('buildIconClass', () => {
  it('emits "fa <style> fa-<name>" for a bare icon name', () => {
    expect(buildIconClass('house', 'solid')).toBe('fa fa-solid fa-house');
    expect(buildIconClass('star', 'regular')).toBe('fa fa-regular fa-star');
    expect(buildIconClass('github', 'brands')).toBe('fa fa-brands fa-github');
  });

  it('adds the style prefix when only "fa-name" was provided', () => {
    expect(buildIconClass('fa-house', 'solid')).toBe('fa fa-solid fa-house');
    expect(buildIconClass('fa-github', 'brands')).toBe('fa fa-brands fa-github');
  });

  it('passes through a full class string verbatim and prepends "fa"', () => {
    expect(buildIconClass('fa-solid fa-house', 'solid')).toBe('fa fa-solid fa-house');
    expect(buildIconClass('fa-brands fa-github', 'solid')).toBe('fa fa-brands fa-github');
  });

  it('passes through legacy short-form classes (fas/far/fab)', () => {
    expect(buildIconClass('fas fa-house', 'regular')).toBe('fa fas fa-house');
    expect(buildIconClass('far fa-bell', 'solid')).toBe('fa far fa-bell');
    expect(buildIconClass('fab fa-github', 'solid')).toBe('fa fab fa-github');
  });

  it('returns empty string for blank or whitespace-only input', () => {
    expect(buildIconClass('', 'solid')).toBe('');
    expect(buildIconClass('   ', 'solid')).toBe('');
  });

  it('trims surrounding whitespace before building', () => {
    expect(buildIconClass('  house  ', 'solid')).toBe('fa fa-solid fa-house');
  });
});

describe('pickStyleForIcon', () => {
  it('keeps the user-selected style when the icon supports it', () => {
    expect(pickStyleForIcon('regular', ['solid', 'regular'], 'solid')).toBe('regular');
    expect(pickStyleForIcon('solid', ['solid', 'regular'], 'solid')).toBe('solid');
  });

  it('snaps to the icon primary kind when the user style is unsupported', () => {
    // This is the F071-fallback regression: user on `regular`, picks a
    // solid-only icon, must not render `fa-regular fa-X` against a woff2
    // that doesn't have X.
    expect(pickStyleForIcon('regular', ['solid'], 'solid')).toBe('solid');
    expect(pickStyleForIcon('solid', ['brands'], 'brands')).toBe('brands');
    expect(pickStyleForIcon('regular', ['brands'], 'brands')).toBe('brands');
  });

  it('handles the single-style case (most icons)', () => {
    expect(pickStyleForIcon('solid', ['solid'], 'solid')).toBe('solid');
    expect(pickStyleForIcon('brands', ['brands'], 'brands')).toBe('brands');
  });
});

describe('searchFullCatalog', () => {
  const sample: readonly FaIconEntry[] = [
    { name: 'house', kind: 'solid', cat: 'General', kw: ['home', 'main'] },
    { name: 'magnifying-glass', kind: 'solid', cat: 'General', kw: ['search', 'find', 'zoom'] },
    { name: 'github', kind: 'brands', cat: 'Brands' },
    { name: 'google-pay', kind: 'brands', cat: 'Brands', kw: ['payment'] },
  ];

  it('returns the full catalog for an empty query', () => {
    expect(searchFullCatalog('', sample)).toBe(sample);
    expect(searchFullCatalog('   ', sample)).toBe(sample);
  });

  it('matches against the icon name', () => {
    const r = searchFullCatalog('house', sample);
    expect(r.map((i) => i.name)).toEqual(['house']);
  });

  it('matches against keyword aliases when the name does not contain the term', () => {
    // "search" is a kw on magnifying-glass, not in the name.
    const r = searchFullCatalog('search', sample);
    expect(r.map((i) => i.name)).toEqual(['magnifying-glass']);
  });

  it('tokenizes whitespace-separated queries with AND semantics', () => {
    // "google pay" must match both tokens — the contract that lets users
    // search by spaced product names.
    const r = searchFullCatalog('google pay', sample);
    expect(r.map((i) => i.name)).toEqual(['google-pay']);
  });

  it('is case-insensitive', () => {
    const r = searchFullCatalog('HOUSE', sample);
    expect(r.map((i) => i.name)).toEqual(['house']);
  });

  it('returns an empty list when nothing matches', () => {
    const r = searchFullCatalog('definitely-not-an-icon', sample);
    expect(r).toEqual([]);
  });
});

// loadAllFaIcons() — covers the manifest fetch + entriesFromManifest merge.
// The full catalog merge logic is what previously hid the F071 bug, so this
// is the most important test surface.
describe('loadAllFaIcons', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Clear module-level memoization so each test gets a fresh load.
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function loadFresh(): Promise<readonly FaIconEntry[]> {
    // Re-import after vi.resetModules to get a clean cachedFullCatalog.
    const mod = await import('@/lib/font-awesome-icons');
    return mod.loadAllFaIcons();
  }

  function mockManifest(icons: ReadonlyArray<{ name: string; kind: string; styles?: string[]; kw?: string[] }>) {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ version: '7.2.0', icons }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof globalThis.fetch;
  }

  it('parses manifest entries into the FaIconEntry shape', async () => {
    mockManifest([
      { name: 'aaa', kind: 'solid', styles: ['solid'], kw: ['first'] },
      { name: 'github', kind: 'brands', styles: ['brands'] },
    ]);
    const list = await loadFresh();
    const aaa = list.find((i) => i.name === 'aaa');
    expect(aaa).toBeDefined();
    expect(aaa!.kind).toBe('solid');
    expect(aaa!.styles).toEqual(['solid']);
  });

  it('preserves the manifest order of styles so primary kind shows first', async () => {
    mockManifest([
      { name: 'bell', kind: 'solid', styles: ['regular', 'solid'] },
    ]);
    const list = await loadFresh();
    const bell = list.find((i) => i.name === 'bell');
    expect(bell!.styles).toContain('solid');
    expect(bell!.styles).toContain('regular');
  });

  it('merges curated keyword aliases with manifest search terms (no dupes)', async () => {
    // Pick a name from the curated list and feed it back through the manifest
    // — the merged entry should include both sources of keywords, deduped.
    const curated = FA_ICONS.find((i) => i.name === 'house');
    expect(curated).toBeDefined();
    expect(curated!.kw).toContain('home');

    mockManifest([
      { name: 'house', kind: 'solid', styles: ['solid'], kw: ['abode', 'home'] },
    ]);
    const list = await loadFresh();
    const house = list.find((i) => i.name === 'house');
    expect(house!.kw).toContain('home');   // shared between sources, must dedup
    expect(house!.kw).toContain('main');   // from curated only
    expect(house!.kw).toContain('abode');  // from manifest only
    const homeOccurrences = house!.kw!.filter((k) => k === 'home').length;
    expect(homeOccurrences).toBe(1);
  });

  it('keeps the curated category when an icon is in both sources', async () => {
    mockManifest([
      { name: 'house', kind: 'solid', styles: ['solid'] },
    ]);
    const list = await loadFresh();
    const house = list.find((i) => i.name === 'house');
    // Curated says cat: 'Popular'; manifest doesn't carry categories.
    expect(house!.cat).toBe('Popular');
  });

  it('puts uncurated icons in the catch-all category', async () => {
    mockManifest([
      { name: 'never-curated-icon', kind: 'solid', styles: ['solid'] },
    ]);
    const list = await loadFresh();
    const entry = list.find((i) => i.name === 'never-curated-icon');
    expect(entry!.cat).toBe('All');
  });

  it('routes uncurated brand icons to "Brands" category', async () => {
    mockManifest([
      { name: 'never-curated-brand', kind: 'brands', styles: ['brands'] },
    ]);
    const list = await loadFresh();
    const entry = list.find((i) => i.name === 'never-curated-brand');
    expect(entry!.cat).toBe('Brands');
  });

  it('normalizes unknown manifest kind strings to "solid" (forward-compat)', async () => {
    mockManifest([
      { name: 'future-style', kind: 'sharp-light', styles: ['sharp-light'] },
    ]);
    const list = await loadFresh();
    const entry = list.find((i) => i.name === 'future-style');
    expect(entry!.kind).toBe('solid');
  });

  it('falls back to the curated subset without caching when the fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof globalThis.fetch;

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('@/lib/font-awesome-icons');
    const list = await mod.loadAllFaIcons();
    consoleSpy.mockRestore();

    // The fallback should be the same shape/length as the curated subset.
    // We can't compare by reference because vi.resetModules has put the
    // test's FA_ICONS in a different module instance than the one returned
    // by loadAllFaIcons.
    expect(list).toHaveLength(mod.FA_ICONS.length);
    expect(list[0]).toEqual(mod.FA_ICONS[0]);

    // Critical: the failure must NOT have been cached. A subsequent
    // successful fetch should produce the manifest result, proving the
    // in-flight slot was cleared so the next caller retries.
    mockManifest([
      { name: 'recovered', kind: 'solid', styles: ['solid'] },
    ]);
    const second = await mod.loadAllFaIcons();
    expect(second.find((i) => i.name === 'recovered')).toBeDefined();
  });

  it('memoizes successful loads — same reference on second call', async () => {
    mockManifest([
      { name: 'cached', kind: 'solid', styles: ['solid'] },
    ]);
    const first = await loadFresh();
    const mod = await import('@/lib/font-awesome-icons');
    const second = await mod.loadAllFaIcons();
    expect(second).toBe(first);
  });
});

describe('lookups against the loaded catalog', () => {
  it('getFullFaCatalog falls back to FA_ICONS when nothing is loaded', async () => {
    vi.resetModules();
    const mod = await import('@/lib/font-awesome-icons');
    expect(mod.getFullFaCatalog()).toBe(mod.FA_ICONS);
  });

  it('getFaIconKind returns kind from the curated subset before manifest loads', async () => {
    vi.resetModules();
    const mod = await import('@/lib/font-awesome-icons');
    expect(mod.getFaIconKind('house')).toBe('solid');
    expect(mod.getFaIconKind('github')).toBe('brands');
  });

  it('getFaIconStyles returns [kind] when curated entry has no styles array', async () => {
    vi.resetModules();
    const mod = await import('@/lib/font-awesome-icons');
    const styles = mod.getFaIconStyles('house');
    expect(styles).toEqual(['solid']);
  });

  it('getFaIconKind returns undefined for an unknown name', async () => {
    vi.resetModules();
    const mod = await import('@/lib/font-awesome-icons');
    expect(mod.getFaIconKind('not-a-real-icon-xyz')).toBeUndefined();
  });
});

// Type-only sanity: the kind union should be the three real FA free families.
describe('FaIconKind union', () => {
  it('accepts the three documented values', () => {
    const kinds: FaIconKind[] = ['solid', 'regular', 'brands'];
    expect(kinds).toHaveLength(3);
  });
});

// Integrity check against the real Font Awesome package. Reads the actual
// metadata file shipped in node_modules and asserts every curated entry is
// still a valid free icon. Without this, FA upgrades silently drift the
// curated list out of sync with the installed package — six entries from
// FA 6 (`unlink`, `arrow-down-to-bracket`, `history`, `parking`,
// `user-circle`, `firebase`) survived the FA 7 bump and rendered as
// fallback codepoint text on real displays before this test was added.
describe('FA_ICONS curated list internal integrity', () => {
  // A duplicate name in FA_ICONS produces duplicate React keys in the picker's
  // empty-state grid (`solid:file-arrow-down` was hit twice when the same name
  // was listed under both Arrows and Files), which left ghost cells in the
  // grid after the user typed a search query — React's reconciliation with
  // duplicate keys is "unsupported" and pinned the first DOM node in place
  // even after the data array no longer contained it.
  it('has no duplicate icon names', () => {
    const seen = new Map<string, number>();
    for (const entry of FA_ICONS) {
      seen.set(entry.name, (seen.get(entry.name) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    expect(dupes, `Duplicate names in FA_ICONS: ${dupes.join(', ')}`).toEqual([]);
  });
});

describe('FA_ICONS curated list vs installed Font Awesome package', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');

  const metadataPath = path.join(
    process.cwd(),
    'node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json',
  );
  const skip = !fs.existsSync(metadataPath);
  const metadata = skip
    ? null
    : (JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, {
        familyStylesByLicense?: { free?: { family: string; style: string }[] };
      }>);

  it.skipIf(skip)('every curated icon name exists in the installed FA metadata', () => {
    const missing: string[] = [];
    for (const entry of FA_ICONS) {
      if (!metadata![entry.name]) missing.push(entry.name);
    }
    expect(missing, `Curated names missing from FA metadata: ${missing.join(', ')}`).toEqual([]);
  });

  it.skipIf(skip)('every curated icon ships in the free tier', () => {
    const proOnly: string[] = [];
    for (const entry of FA_ICONS) {
      const meta = metadata![entry.name];
      if (!meta) continue; // Covered by the previous test
      const free = meta.familyStylesByLicense?.free ?? [];
      if (free.length === 0) proOnly.push(entry.name);
    }
    expect(proOnly, `Curated icons that are pro-only: ${proOnly.join(', ')}`).toEqual([]);
  });

  it.skipIf(skip)("every curated icon's primary kind is one of its real free styles", () => {
    const mismatched: string[] = [];
    for (const entry of FA_ICONS) {
      const meta = metadata![entry.name];
      if (!meta) continue;
      const freeStyles = (meta.familyStylesByLicense?.free ?? []).map((f) => f.style);
      if (freeStyles.length === 0) continue;
      // Brands lives in its own family — only `kind: 'brands'` matches.
      // For non-brands, `solid` is always available if the icon exists in
      // free at all (per FA 7's catalog), so a curated `kind: 'solid'` is
      // safe; `kind: 'regular'` would require explicit verification.
      if (entry.kind === 'brands' && !freeStyles.includes('brands')) {
        mismatched.push(`${entry.name} (curated brands, free has [${freeStyles.join(',')}])`);
      } else if (entry.kind !== 'brands' && !freeStyles.includes(entry.kind)) {
        mismatched.push(`${entry.name} (curated ${entry.kind}, free has [${freeStyles.join(',')}])`);
      }
    }
    expect(mismatched, `Curated kind doesn't match real free styles: ${mismatched.join(', ')}`).toEqual([]);
  });
});
