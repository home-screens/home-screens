import { describe, it, expect } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { dragEndIndices } from '@/hooks/useDndSensors';
import {
  DEFAULT_ROTATION_SECONDS,
  DISPLAY_FIELD_FALLBACKS,
  DISPLAY_OVERRIDE_FIELDS,
  resolveDisplayDefault,
} from '@/lib/display-override-fields';
import { FORM_DEFAULTS } from '@/lib/settings-form';
import { buildDefaultModule, getModuleDefinition, type ModuleDefinition } from '@/lib/module-registry';
import { clampToCanvas } from '@/lib/module-utils';
import { dashSlug } from '@/lib/slug';
import { subredditFeedUrl, subredditName } from '@/lib/news/sources';

const drag = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over === null ? null : { id: over } }) as unknown as DragEndEvent;

describe('dragEndIndices', () => {
  const ids = ['a', 'b', 'c'];
  it('names both positions of a real move', () => {
    expect(dragEndIndices(drag('a', 'c'), ids)).toEqual({ from: 0, to: 2 });
  });
  it('is nothing for a drop in place, off the list, or on a row that is gone', () => {
    expect(dragEndIndices(drag('a', 'a'), ids)).toBeNull();
    expect(dragEndIndices(drag('a', null), ids)).toBeNull();
    expect(dragEndIndices(drag('a', 'z'), ids)).toBeNull();
    expect(dragEndIndices(drag('z', 'a'), ids)).toBeNull();
  });
});

describe('display field fallbacks', () => {
  it('names a fallback for every overridable field', () => {
    expect(Object.keys(DISPLAY_FIELD_FALLBACKS).sort()).toEqual([...DISPLAY_OVERRIDE_FIELDS].sort());
  });
  it('gives the saved value when there is one, even a falsy one', () => {
    expect(resolveDisplayDefault({ pauseEnabled: false }, 'pauseEnabled')).toBe(false);
    expect(resolveDisplayDefault({ pauseTimeoutSeconds: 0 }, 'pauseTimeoutSeconds')).toBe(0);
  });
  it('falls back as the wall does when nothing was saved', () => {
    expect(resolveDisplayDefault({}, 'transitionDuration')).toBe(0.6);
    expect(resolveDisplayDefault({}, 'fullscreenTheme')).toBe('linen');
    expect(resolveDisplayDefault({}, 'pixelShift')).toBe(false);
  });
  it('is what the Defaults page starts from', () => {
    expect(FORM_DEFAULTS.display.rotationInterval).toBe(DEFAULT_ROTATION_SECONDS);
    expect(DEFAULT_ROTATION_SECONDS).toBe(30);
    for (const key of DISPLAY_OVERRIDE_FIELDS) {
      if (key === 'rotationIntervalMs') continue;
      expect([key, FORM_DEFAULTS.display[key]]).toEqual([key, DISPLAY_FIELD_FALLBACKS[key]]);
    }
  });
});

describe('buildDefaultModule', () => {
  const dims = { width: 1080, height: 1920 };
  it('starts a news module on a feed in the household language', () => {
    const def = getModuleDefinition('fullscreen-news')!;
    const english = buildDefaultModule(def, 'fullscreen-news', { dims, locale: 'en-US', position: { x: 0, y: 0 } });
    const german = buildDefaultModule(def, 'fullscreen-news', { dims, locale: 'de-DE', position: { x: 0, y: 0 } });
    const feed = (m: { config: Record<string, unknown> }) => (m.config.feeds as { url: string }[])[0].url;
    expect(feed(german)).not.toBe(feed(english));
    expect(german.size).toEqual({ w: 1080, h: 1920 });
  });
  it('lays overrides over the registry config', () => {
    const def = getModuleDefinition('clock')!;
    const made = buildDefaultModule(def, 'clock', { dims, position: { x: 5, y: 6 }, configOverrides: { view: 'flip' } });
    expect(made.config).toMatchObject({ ...def.defaultConfig, view: 'flip' });
    expect(made.position).toEqual({ x: 5, y: 6 });
  });
  it('never gives a plugin or a cardless module a title nobody can see', () => {
    const base = getModuleDefinition('clock')!;
    const titled: ModuleDefinition = { ...base, defaultStyle: { title: 'Hidden', titleFontSize: 20 } };
    const plugin = buildDefaultModule(titled, 'plugin:demo', { dims, position: { x: 0, y: 0 } });
    const cardless = buildDefaultModule({ ...titled, cardless: true }, 'clock', { dims, position: { x: 0, y: 0 } });
    const carded = buildDefaultModule(titled, 'clock', { dims, position: { x: 0, y: 0 } });
    expect(plugin.style.title).toBeUndefined();
    expect(cardless.style.titleFontSize).toBeUndefined();
    expect(carded.style.title).toBe('Hidden');
  });
});

describe('clampToCanvas', () => {
  const dims = { width: 100, height: 200 };
  it('holds a box inside the canvas', () => {
    expect(clampToCanvas({ x: 90, y: 190 }, { w: 20, h: 20 }, dims)).toEqual({ x: 80, y: 180 });
    expect(clampToCanvas({ x: -5, y: -5 }, { w: 20, h: 20 }, dims)).toEqual({ x: 0, y: 0 });
  });
  it('keeps a box bigger than the canvas at the origin', () => {
    expect(clampToCanvas({ x: 10, y: 10 }, { w: 300, h: 300 }, dims)).toEqual({ x: 0, y: 0 });
  });
});

describe('dashSlug', () => {
  it('reads a name as a slug', () => {
    expect(dashSlug('  Kitchen Wall! ')).toBe('kitchen-wall');
    expect(dashSlug('my-layout')).toBe('my-layout');
    expect(dashSlug('!!!')).toBe('');
  });
});

describe('subredditName', () => {
  it('takes the forms people paste and feeds the feed address', () => {
    expect(subredditName('/r/homeassistant/')).toBe('homeassistant');
    expect(subredditName('r/aww')).toBe('aww');
    expect(subredditName('a')).toBeNull();
    expect(subredditName('has space')).toBeNull();
    expect(subredditFeedUrl('r/aww')).toBe('https://www.reddit.com/r/aww/new/.rss');
    expect(subredditFeedUrl('no way')).toBeNull();
  });
});
