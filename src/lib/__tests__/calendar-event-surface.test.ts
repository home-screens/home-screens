import { describe, it, expect } from 'vitest';
import {
  calendarFallbackAccent,
  eventBg,
  eventBorder,
  eventSurface,
  resolveCalendarAccent,
} from '../calendar-event-surface';
import { getThemeTokens } from '../fullscreen-themes';

const LIGHT = { isDark: false, eventStyle: 'wash' } as const;
const BLUE = '#3B82F6';

describe('resolveCalendarAccent', () => {
  it('prefers the user color, then the theme accent, then the orange fallback', () => {
    expect(resolveCalendarAccent('#123456', getThemeTokens('aurora'))).toBe('#123456');
    expect(resolveCalendarAccent('', getThemeTokens('aurora'))).toBe('#5EEAD4');
    expect(resolveCalendarAccent('', getThemeTokens('linen'))).toBe(calendarFallbackAccent(false));
    expect(resolveCalendarAccent(undefined, getThemeTokens('slate'))).toBe(calendarFallbackAccent(true));
  });
});

describe('eventBg / eventBorder', () => {
  it('composes the source color with the alpha on light themes', () => {
    expect(eventBg(BLUE, 0.2, false)).toBe('rgba(59,130,246,0.2)');
    expect(eventBorder(BLUE, false)).toBe(BLUE);
  });

  it('falls back to blue for an unparseable color', () => {
    expect(eventBg('teal', 0.5, false)).toBe('rgba(59,130,246,0.5)');
  });
});

describe('eventSurface', () => {
  it('reproduces the original wash look per variant', () => {
    expect(eventSurface(BLUE, LIGHT, 'block', { washAlpha: 0.09 })).toEqual({
      borderLeft: `3px solid ${BLUE}`,
      background: 'rgba(59,130,246,0.09)',
      borderRadius: undefined,
    });
    expect(eventSurface(BLUE, LIGHT, 'chip', { radius: 3 })).toEqual({
      background: 'rgba(59,130,246,0.13)',
      border: '1px solid rgba(59,130,246,0.2)',
      color: BLUE,
      borderRadius: 3,
    });
    // The month grid entry and the week list row are bare under wash.
    expect(eventSurface(BLUE, LIGHT, 'pill', { radius: 3 })).toEqual({ borderRadius: 3 });
    expect(eventSurface(BLUE, LIGHT, 'row')).toEqual({ borderRadius: undefined });
  });

  it('owns its ink under solid so every child line inherits legible text', () => {
    const light = eventSurface(BLUE, { isDark: false, eventStyle: 'solid' }, 'card') as Record<string, unknown>;
    expect(light.background).toBe(BLUE);
    expect(light.color).toBe('#ffffff');
    expect(light['--cal-text-primary']).toBe('#ffffff');
    expect(light['--cal-text-secondary']).toBe('rgba(255,255,255,0.82)');
    expect(light['--cal-text-tertiary']).toBe('rgba(255,255,255,0.82)');

    // A lifted fill on a dark theme takes dark ink instead.
    const dark = eventSurface(BLUE, { isDark: true, eventStyle: 'solid' }, 'chip') as Record<string, unknown>;
    expect(dark.color).toBe('#10100f');
  });

  it('keeps the glass pill inside its height budget with an inset ring', () => {
    const pill = eventSurface(BLUE, { isDark: false, eventStyle: 'glass' }, 'pill');
    expect(pill.border).toBeUndefined();
    expect(pill.boxShadow).toBe('inset 0 0 0 1px rgba(59,130,246,0.4)');

    const block = eventSurface(BLUE, { isDark: false, eventStyle: 'glass' }, 'block');
    expect(block.border).toBe('1px solid rgba(59,130,246,0.4)');
  });

  it('composites onto the module background only when asked to be opaque', () => {
    const paint = { isDark: true, eventStyle: 'rule' } as const;
    expect(eventSurface(BLUE, paint, 'block').background).toBe('var(--cal-surface)');
    expect(eventSurface(BLUE, paint, 'block', { opaque: true }).background).toBe(
      'linear-gradient(var(--cal-surface), var(--cal-surface)), var(--cal-bg)',
    );
    expect(eventSurface(BLUE, LIGHT, 'card', { opaque: true }).background).toBe(
      'linear-gradient(var(--cal-surface), var(--cal-surface)), var(--cal-bg)',
    );
  });
});
