import { describe, it, expect } from 'vitest';
import {
  parseSettingsRoute,
  resolveSettingsRoute,
  DEFAULT_PAGE_IDS,
  PER_DISPLAY_SUBTABS,
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

  it('falls back to defaults/screen when section=display has no id', () => {
    const params = new URLSearchParams('section=display&subtab=overrides');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'defaults', page: 'screen' });
  });

  it('ignores a stray ?tab= param and parses the rest', () => {
    // `?tab=` was the pre-reorganization flat-sidebar shape; it is no
    // longer routable and must not affect what the rest of the URL says.
    const params = new URLSearchParams('tab=meals&section=displays');
    expect(parseSettingsRoute(params)).toEqual({ kind: 'displays' });
  });

  it('resolves a bare legacy ?tab= bookmark to the default page', () => {
    // In-product links shipped `?tab=X` until the reorganization, so the
    // silent fallback IS the documented behavior for that shape — pin it
    // directly so a parser edit can't change it unnoticed.
    expect(parseSettingsRoute(new URLSearchParams('tab=meals'))).toEqual({
      kind: 'defaults',
      page: 'screen',
    });
  });
});

describe('resolveSettingsRoute', () => {
  it('returns no redirectedQuery for a canonical query string', () => {
    expect(resolveSettingsRoute('section=defaults&page=screen')).toEqual({
      route: { kind: 'defaults', page: 'screen' },
    });
  });

  it('tolerates a leading ? prefix the way window.location.search produces it', () => {
    expect(resolveSettingsRoute('?section=displays')).toEqual({
      route: { kind: 'displays' },
    });
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

  it('preserves unrelated query params during the stale-panel rewrite', () => {
    // Analytics tags / utm_* / arbitrary user-added params shouldn't be
    // dropped just because the page is rewriting a stale `?panel=` — that
    // would silently break tracked links.
    const result = resolveSettingsRoute(
      'section=defaults&page=weather&panel=rules&utm_source=email',
    );
    expect(result.redirectedQuery).toBeDefined();
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('utm_source')).toBe('email');
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('weather');
  });

  it('rewrites an unknown subtab to the overview fallback the parser resolved', () => {
    const result = resolveSettingsRoute('section=display&id=kitchen&subtab=banana');
    expect(result.route).toEqual({
      kind: 'display',
      displayId: 'kitchen',
      subtab: 'overview',
    });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('subtab')).toBe('overview');
    expect(next.get('id')).toBe('kitchen');
  });

  it('rewrites an unknown page id to the screen fallback the parser resolved', () => {
    // The URL bar must not keep advertising a page that is not rendering.
    const result = resolveSettingsRoute('section=defaults&page=banana');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('page')).toBe('screen');
  });

  it('strips a ?panel= arriving without a section', () => {
    // The parser's fallback never reads `?panel=`, so it is neither honored
    // nor kept: the rewrite drops it and canonicalizes the fallback page.
    const result = resolveSettingsRoute('panel=sleep');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('panel')).toBeNull();
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('screen');
  });

  it('does not rewrite a bare legacy ?tab= bookmark (?tab= is an unrelated param now)', () => {
    // `?tab=` is not a routing key anymore, so it is an unrelated param:
    // the route falls back to the default page and the URL is left alone.
    const result = resolveSettingsRoute('tab=meals');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    expect(result.redirectedQuery).toBeUndefined();
  });
});
