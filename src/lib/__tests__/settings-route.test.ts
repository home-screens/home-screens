import { describe, it, expect } from 'vitest';
import {
  parseSettingsRoute,
  resolveSettingsRoute,
  LEGACY_TAB_REDIRECTS,
  DEFAULT_PAGE_IDS,
  PER_DISPLAY_SUBTABS,
} from '@/lib/settings-route';

/**
 * Pure-function unit tests for the settings route parser. These exist
 * because the original parser lived inside the settings page client
 * component and depended on `window.location` / `window.history`, which
 * the project's `node` test environment can't provide. Phase 5 hoisted
 * the logic into `lib/settings-route` so it can be exercised here as a
 * direct call against `URLSearchParams`.
 */

describe('parseSettingsRoute', () => {
  it('falls back to defaults/display when no params are present', () => {
    expect(parseSettingsRoute(new URLSearchParams(''))).toEqual({
      kind: 'defaults',
      page: 'display',
    });
  });

  it('parses ?section=defaults&page=X for every known DEFAULT_PAGE_IDS entry', () => {
    for (const id of DEFAULT_PAGE_IDS) {
      const params = new URLSearchParams(`section=defaults&page=${id}`);
      expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: id });
    }
  });

  it('rejects an unknown ?section=defaults&page= value and falls back to display', () => {
    const params = new URLSearchParams('section=defaults&page=banana');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'display' });
  });

  it('parses ?section=displays as the all-displays index', () => {
    expect(parseSettingsRoute(new URLSearchParams('section=displays'))).toEqual({
      kind: 'displays',
    });
  });

  it('parses ?section=display&id=X&subtab=Y for every known PER_DISPLAY_SUBTABS entry', () => {
    for (const subtab of PER_DISPLAY_SUBTABS) {
      const params = new URLSearchParams(`section=display&id=kitchen&subtab=${subtab}`);
      expect(parseSettingsRoute(params)).toEqual({
        kind: 'display',
        displayId: 'kitchen',
        subtab,
      });
    }
  });

  it('defaults the subtab to overview when omitted', () => {
    const params = new URLSearchParams('section=display&id=kitchen');
    expect(parseSettingsRoute(params)).toEqual({
      kind: 'display',
      displayId: 'kitchen',
      subtab: 'overview',
    });
  });

  it('coerces an unknown subtab to overview', () => {
    const params = new URLSearchParams('section=display&id=kitchen&subtab=banana');
    expect(parseSettingsRoute(params)).toEqual({
      kind: 'display',
      displayId: 'kitchen',
      subtab: 'overview',
    });
  });

  it('falls back to defaults/display when section=display has no id', () => {
    const params = new URLSearchParams('section=display&subtab=display');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'display' });
  });

  it('honors a legacy ?tab=X mapping over a present section param', () => {
    // Legacy redirect wins so old bookmarks survive even if a parallel
    // `section=...` somehow leaks through. (In practice the rewrite
    // effect drops the `tab` key on the next render, but the parser
    // must still resolve the right page on the first one.)
    const params = new URLSearchParams('tab=sleep&section=displays');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'sleep' });
  });

  it('honors a legacy ?tab=X mapping even when section=defaults&page=Y co-exists', () => {
    // Same priority rule as above, but with the two query shapes that
    // would only realistically co-occur if a stale ?tab= was glued onto
    // a freshly-shared link from the new sidebar. The legacy mapping
    // wins so the user lands on the page their bookmark intended.
    const params = new URLSearchParams('tab=sleep&section=defaults&page=display');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'sleep' });
  });

  it.each(Object.keys(LEGACY_TAB_REDIRECTS))(
    'maps every legacy ?tab=%s to the documented route',
    (tab) => {
      const params = new URLSearchParams(`tab=${tab}`);
      expect(parseSettingsRoute(params)).toEqual(LEGACY_TAB_REDIRECTS[tab]);
    },
  );

  it('ignores an unknown legacy ?tab= value and parses the rest', () => {
    const params = new URLSearchParams('tab=banana&section=displays');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'displays' });
  });
});

describe('resolveSettingsRoute', () => {
  it('returns no redirectedQuery when no legacy ?tab= is present', () => {
    expect(resolveSettingsRoute('section=defaults&page=display')).toEqual({
      route: { kind: 'defaults', page: 'display' },
    });
  });

  it('tolerates a leading ? prefix the way window.location.search produces it', () => {
    expect(resolveSettingsRoute('?section=displays')).toEqual({
      route: { kind: 'displays' },
    });
  });

  it('returns the canonical query string when a legacy ?tab=X is present', () => {
    const result = resolveSettingsRoute('tab=display');
    expect(result.route).toEqual({ kind: 'defaults', page: 'display' });
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('tab')).toBeNull();
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('display');
  });

  it('redirects ?tab=displays to ?section=displays without leaking a page param', () => {
    const result = resolveSettingsRoute('tab=displays');
    expect(result.route).toEqual({ kind: 'displays' });
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('section')).toBe('displays');
    expect(next.get('page')).toBeNull();
    expect(next.get('tab')).toBeNull();
  });

  it('preserves unrelated query params during the legacy redirect', () => {
    // Analytics tags / utm_* / arbitrary user-added params shouldn't be
    // dropped just because the page is rewriting `?tab=` into the new
    // shape — that would silently break tracked links.
    const result = resolveSettingsRoute('tab=sleep&utm_source=email');
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('utm_source')).toBe('email');
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('sleep');
  });

  it('does not set redirectedQuery for an unknown legacy ?tab= value', () => {
    const result = resolveSettingsRoute('tab=banana');
    expect(result.route).toEqual({ kind: 'defaults', page: 'display' });
    expect(result.redirectedQuery).toBeUndefined();
  });
});

describe('LEGACY_TAB_REDIRECTS', () => {
  it('only maps to known DEFAULT_PAGE_IDS or to the displays section', () => {
    // Guards against a future contributor adding a legacy redirect that
    // points at a page id that no longer exists in DEFAULT_PAGE_IDS,
    // which would silently land users on the fallback page.
    const knownPages = new Set<string>(DEFAULT_PAGE_IDS);
    for (const route of Object.values(LEGACY_TAB_REDIRECTS)) {
      if (route.kind === 'defaults') {
        expect(knownPages.has(route.page)).toBe(true);
      } else {
        expect(route.kind).toBe('displays');
      }
    }
  });
});
