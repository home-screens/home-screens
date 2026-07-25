import { describe, it, expect } from 'vitest';
import {
  parseSettingsRoute,
  resolveSettingsRoute,
  LEGACY_TAB_REDIRECTS,
  LEGACY_PAGE_REDIRECTS,
  LEGACY_SUBTAB_REDIRECTS,
  DEFAULT_PAGE_IDS,
  PER_DISPLAY_SUBTABS,
  validPanelFor,
} from '@/lib/settings-route';

/**
 * Pure-function unit tests for the settings route parser. These exist
 * because the original parser lived inside the settings page client
 * component and depended on `window.location` / `window.history`, which
 * the project's `node` test environment can't provide. The logic was
 * hoisted into `lib/settings-route` so it can be exercised here as a
 * direct call against `URLSearchParams`.
 */

describe('parseSettingsRoute', () => {
  it('falls back to defaults/screen when no params are present', () => {
    expect(parseSettingsRoute(new URLSearchParams(''))).toEqual({
      kind: 'defaults',
      page: 'screen',
    });
  });

  it('parses ?section=defaults&page=X for every known DEFAULT_PAGE_IDS entry', () => {
    for (const id of DEFAULT_PAGE_IDS) {
      const params = new URLSearchParams(`section=defaults&page=${id}`);
      expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: id });
    }
  });

  it('rejects an unknown ?section=defaults&page= value and falls back to screen', () => {
    const params = new URLSearchParams('section=defaults&page=banana');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'screen' });
  });

  it.each(Object.entries(LEGACY_PAGE_REDIRECTS))(
    'maps the retired ?section=defaults&page=%s to its absorbing page and tab',
    (oldId, target) => {
      const params = new URLSearchParams(`section=defaults&page=${oldId}`);
      expect(parseSettingsRoute(params)).toEqual(
        target.panel
          ? { kind: 'defaults', page: target.page, panel: target.panel }
          : { kind: 'defaults', page: target.page },
      );
    },
  );

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

  it.each(Object.entries(LEGACY_SUBTAB_REDIRECTS))(
    'maps the retired ?subtab=%s to its absorbing subtab',
    (oldId, newId) => {
      const params = new URLSearchParams(`section=display&id=kitchen&subtab=${oldId}`);
      expect(parseSettingsRoute(params)).toEqual({
        kind: 'display',
        displayId: 'kitchen',
        subtab: newId,
      });
    },
  );

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

  it('falls back to defaults/screen when section=display has no id', () => {
    const params = new URLSearchParams('section=display&subtab=overrides');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'screen' });
  });

  it('honors a legacy ?tab=X mapping over a present section param', () => {
    // Legacy redirect wins so old bookmarks survive even if a parallel
    // `section=...` somehow leaks through. (In practice the rewrite
    // effect drops the `tab` key on the next render, but the parser
    // must still resolve the right page on the first one.)
    const params = new URLSearchParams('tab=sleep&section=displays');
    expect(parseSettingsRoute(params)).toEqual({
      kind: 'defaults',
      page: 'screen',
      panel: 'sleep',
    });
  });

  it('honors a legacy ?tab=X mapping even when section=defaults&page=Y co-exists', () => {
    // Same priority rule as above, but with the two query shapes that
    // would only realistically co-occur if a stale ?tab= was glued onto
    // a freshly-shared link from the new sidebar. The legacy mapping
    // wins so the user lands on the page their bookmark intended.
    const params = new URLSearchParams('tab=weather&section=defaults&page=screen');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'weather' });
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
    expect(resolveSettingsRoute('section=defaults&page=screen')).toEqual({
      route: { kind: 'defaults', page: 'screen' },
    });
  });

  it('tolerates a leading ? prefix the way window.location.search produces it', () => {
    expect(resolveSettingsRoute('?section=displays')).toEqual({
      route: { kind: 'displays' },
    });
  });

  it('returns the canonical query string when a legacy ?tab=X is present', () => {
    const result = resolveSettingsRoute('tab=display');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen', panel: 'appearance' });
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('tab')).toBeNull();
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('screen');
    expect(next.get('panel')).toBe('appearance');
  });

  it('returns the canonical query string when a retired page id is present', () => {
    const result = resolveSettingsRoute('section=defaults&page=rules');
    expect(result.route).toEqual({ kind: 'defaults', page: 'automation', panel: 'rules' });
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('page')).toBe('automation');
    // The whole point: the retired standalone Rules page must land on the
    // Rules tab, not on Automation's default (Profiles) tab.
    expect(next.get('panel')).toBe('rules');
  });

  it('drops a ?panel= that the destination page does not own', () => {
    // A hand-edited or stale URL must not leave the bar advertising a tab that
    // is not what renders.
    const result = resolveSettingsRoute('section=defaults&page=weather&panel=rules');
    expect(result.route).toEqual({ kind: 'defaults', page: 'weather' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('panel')).toBeNull();
  });

  it('passes a valid ?panel= through untouched with no rewrite', () => {
    const result = resolveSettingsRoute('section=defaults&page=screen&panel=alerts');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen', panel: 'alerts' });
    expect(result.redirectedQuery).toBeUndefined();
  });

  it('returns the canonical query string when a retired subtab id is present', () => {
    const result = resolveSettingsRoute('section=display&id=kitchen&subtab=sleep');
    expect(result.route).toEqual({
      kind: 'display',
      displayId: 'kitchen',
      subtab: 'overrides',
    });
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('subtab')).toBe('overrides');
    expect(next.get('id')).toBe('kitchen');
  });

  it('does not rewrite an unknown subtab (parser already falls back to overview)', () => {
    const result = resolveSettingsRoute('section=display&id=kitchen&subtab=banana');
    expect(result.route).toEqual({
      kind: 'display',
      displayId: 'kitchen',
      subtab: 'overview',
    });
    expect(result.redirectedQuery).toBeUndefined();
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
    expect(next.get('page')).toBe('screen');
  });

  it('does not set redirectedQuery for an unknown legacy ?tab= value', () => {
    const result = resolveSettingsRoute('tab=banana');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    expect(result.redirectedQuery).toBeUndefined();
  });
});

describe('legacy redirect tables', () => {
  it('LEGACY_TAB_REDIRECTS only maps to known DEFAULT_PAGE_IDS or to the displays section', () => {
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

  it('LEGACY_PAGE_REDIRECTS never maps a live page id and only targets live ids', () => {
    const knownPages = new Set<string>(DEFAULT_PAGE_IDS);
    for (const [oldId, target] of Object.entries(LEGACY_PAGE_REDIRECTS)) {
      expect(knownPages.has(oldId)).toBe(false);
      expect(knownPages.has(target.page)).toBe(true);
      // A declared panel must be one the destination page actually renders,
      // otherwise the redirect lands on the default tab anyway and the URL bar
      // advertises a tab that does not exist.
      if (target.panel) {
        expect(validPanelFor(target.page, target.panel)).toBe(target.panel);
      }
    }
  });

  it('LEGACY_SUBTAB_REDIRECTS never maps a live subtab id and only targets live ids', () => {
    const knownSubtabs = new Set<string>(PER_DISPLAY_SUBTABS);
    for (const [oldId, newId] of Object.entries(LEGACY_SUBTAB_REDIRECTS)) {
      expect(knownSubtabs.has(oldId)).toBe(false);
      expect(knownSubtabs.has(newId)).toBe(true);
    }
  });
});

/**
 * The redirect-table tests above all iterate `Object.entries(LEGACY_*)` — the
 * very tables under test. That shape can only check the entries that exist, so
 * a retired id someone forgot to ADD to the table is never asserted: a
 * test-that-cannot-fail.
 *
 * These pin the real historical id lists as literals instead. They are
 * deliberately hard-coded rather than read from git: the point is that the
 * expectation cannot move when the source does.
 *
 * When a future reorg retires more ids, append the shipped list here as a new
 * frozen release row.
 */
describe('every id that was ever routable still resolves', () => {
  // From `git show v1.7.1:src/lib/settings-route.ts`.
  const V1_7_1_PAGE_IDS = [
    'display', 'sleep', 'alerts', 'location', 'weather', 'calendar', 'meals',
    'profiles', 'integrations', 'security', 'data', 'stats', 'system',
    'network', 'docs',
  ] as const;

  const V1_7_1_SUBTABS = [
    'overview', 'display', 'sleep', 'alerts', 'profile', 'identity',
  ] as const;

  it.each(V1_7_1_PAGE_IDS)(
    'a v1.7.1 bookmark to ?section=defaults&page=%s lands on a live page',
    (oldId) => {
      const route = parseSettingsRoute(new URLSearchParams(`section=defaults&page=${oldId}`));
      expect(route.kind).toBe('defaults');
      // Not merely "does not crash": an id missing from the table silently
      // falls through to the `screen` default, so assert it either survived as
      // a live id or has a real entry pointing somewhere.
      const isLivePageId = (DEFAULT_PAGE_IDS as readonly string[]).includes(oldId);
      expect(isLivePageId || !!LEGACY_PAGE_REDIRECTS[oldId]).toBe(true);
    },
  );

  it.each(V1_7_1_SUBTABS)(
    'a v1.7.1 bookmark to ?subtab=%s lands on a live subtab',
    (oldId) => {
      const route = parseSettingsRoute(
        new URLSearchParams(`section=display&id=kitchen&subtab=${oldId}`),
      );
      expect(route.kind).toBe('display');
      const isLiveSubtab = (PER_DISPLAY_SUBTABS as readonly string[]).includes(oldId);
      expect(isLiveSubtab || !!LEGACY_SUBTAB_REDIRECTS[oldId]).toBe(true);
    },
  );

  it('every retired v1.7.1 page that became a tab redirects to that tab, not the default', () => {
    // The concrete regression: `?page=sleep` resolving to `{page:'screen'}`
    // with no panel opened the Appearance tab, and the canonicalizer then
    // rewrote the URL bar to that, destroying the bookmark's intent.
    const expected: Record<string, string> = {
      display: 'appearance',
      sleep: 'sleep',
      alerts: 'alerts',
      profiles: 'profiles',
    };
    for (const [oldId, panel] of Object.entries(expected)) {
      const { route, redirectedQuery } = resolveSettingsRoute(
        `section=defaults&page=${oldId}`,
      );
      expect(route).toMatchObject({ kind: 'defaults', panel });
      expect(redirectedQuery).toContain(`panel=${panel}`);
    }
  });

  it('every retired v1.7.1 ?tab= that became a tab redirects to that tab', () => {
    const expected: Record<string, string> = {
      sleep: 'sleep',
      alerts: 'alerts',
      rules: 'rules',
      'default-sleep': 'sleep',
      'default-alerts': 'alerts',
    };
    for (const [tab, panel] of Object.entries(expected)) {
      const { route, redirectedQuery } = resolveSettingsRoute(`tab=${tab}`);
      expect(route).toMatchObject({ kind: 'defaults', panel });
      expect(redirectedQuery).toContain(`panel=${panel}`);
    }
  });
});
