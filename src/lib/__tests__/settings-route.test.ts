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

  it('honors page/panel under an unrecognized section value', () => {
    // A miscased or externally generated `section` must not discard a
    // perfectly valid page+panel — the canonicalizer fixes the section.
    expect(parseSettingsRoute(new URLSearchParams('section=Defaults&page=automation&panel=rules'))).toEqual({
      kind: 'defaults',
      page: 'automation',
      panel: 'rules',
    });
  });

  it('honors an accompanying page when section=display has no id', () => {
    expect(parseSettingsRoute(new URLSearchParams('section=display&page=meals'))).toEqual({
      kind: 'defaults',
      page: 'meals',
    });
  });

  it('parses section-less page/panel params as a defaults route', () => {
    expect(parseSettingsRoute(new URLSearchParams('page=weather'))).toEqual({
      kind: 'defaults',
      page: 'weather',
    });
    expect(parseSettingsRoute(new URLSearchParams('page=screen&panel=sleep'))).toEqual({
      kind: 'defaults',
      page: 'screen',
      panel: 'sleep',
    });
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

  it('honors a section-less URL carrying page/panel params without a rewrite', () => {
    // A hand-trimmed or truncated URL keeps its intent: the parser treats a
    // missing section with settings params as defaults, and since every
    // param it carries agrees with what renders, nothing is rewritten.
    expect(resolveSettingsRoute('page=screen&panel=sleep')).toEqual({
      route: { kind: 'defaults', page: 'screen', panel: 'sleep' },
    });
    expect(resolveSettingsRoute('panel=sleep')).toEqual({
      route: { kind: 'defaults', page: 'screen', panel: 'sleep' },
    });
  });

  it('strips a section-less ?panel= no page owns', () => {
    const result = resolveSettingsRoute('panel=banana');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('panel')).toBeNull();
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('screen');
  });

  it('rewrites a section that dispatched nowhere to the defaults fallback', () => {
    // `section=display` with no id renders the Screen defaults page, so the
    // URL must stop advertising a per-display route (and its subtab).
    const result = resolveSettingsRoute('section=display&subtab=overrides');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('screen');
    expect(next.get('subtab')).toBeNull();
  });

  it('canonicalizes a miscased section while KEEPING the valid page and panel', () => {
    // The rewrite normalizes `section` but must not destroy the intent the
    // URL named — a refresh after the replace still lands on Automation→Rules.
    const result = resolveSettingsRoute('section=Defaults&page=automation&panel=rules');
    expect(result.route).toEqual({ kind: 'defaults', page: 'automation', panel: 'rules' });
    const next = new URLSearchParams(result.redirectedQuery!);
    expect(next.get('section')).toBe('defaults');
    expect(next.get('page')).toBe('automation');
    expect(next.get('panel')).toBe('rules');
  });

  it('does not rewrite a bare legacy ?tab= bookmark (?tab= is an unrelated param now)', () => {
    // `?tab=` is not a routing key anymore, so it is an unrelated param:
    // the route falls back to the default page and the URL is left alone.
    const result = resolveSettingsRoute('tab=meals');
    expect(result.route).toEqual({ kind: 'defaults', page: 'screen' });
    expect(result.redirectedQuery).toBeUndefined();
  });
});
