import { describe, it, expect } from 'vitest';
import { artModeActive, artModeHidesDots, eveningLightActive, inDailyHours, minuteOf, normalizeEveningLight } from '../screen-hours';

const at = (time: string) => minuteOf(time)!;

describe('daily hours', () => {
  it('reads HH:MM and nothing else', () => {
    expect(minuteOf('07:30')).toBe(450);
    expect(minuteOf('24:00')).toBeNull();
    expect(minuteOf('7:30')).toBeNull();
    expect(minuteOf(undefined)).toBeNull();
  });

  it('runs past midnight when the end is before the start', () => {
    expect(inDailyHours(at('22:00'), at('21:00'), at('07:00'))).toBe(true);
    expect(inDailyHours(at('03:00'), at('21:00'), at('07:00'))).toBe(true);
    expect(inDailyHours(at('07:00'), at('21:00'), at('07:00'))).toBe(false);
    expect(inDailyHours(at('12:00'), at('09:00'), at('17:00'))).toBe(true);
    expect(inDailyHours(at('18:00'), at('09:00'), at('17:00'))).toBe(false);
  });
});

describe('evening light', () => {
  it('is off for a screen without it, and for a setting that cannot be read', () => {
    expect(eveningLightActive({}, at('22:00'), null)).toBe(false);
    expect(normalizeEveningLight({ from: 'dusk', until: '07:00' })).toBeUndefined();
    expect(eveningLightActive({ eveningLight: { from: 'sunset', until: 'morning' } }, at('22:00'), null)).toBe(false);
  });

  it('starts at sunset when it is known, at 8 PM when it is not, and ends in the morning', () => {
    const screen = { eveningLight: { from: 'sunset', until: '07:00' } };
    expect(eveningLightActive(screen, at('17:30'), at('17:12'))).toBe(true);
    expect(eveningLightActive(screen, at('17:00'), at('17:12'))).toBe(false);
    expect(eveningLightActive(screen, at('19:30'), null)).toBe(false);
    expect(eveningLightActive(screen, at('20:00'), null)).toBe(true);
    expect(eveningLightActive(screen, at('06:59'), at('17:12'))).toBe(true);
    expect(eveningLightActive(screen, at('07:00'), at('17:12'))).toBe(false);
  });

  it('starts at a set time when one is given', () => {
    const screen = { eveningLight: { from: '18:30', until: '06:00' } };
    expect(eveningLightActive(screen, at('18:29'), at('17:00'))).toBe(false);
    expect(eveningLightActive(screen, at('18:30'), at('17:00'))).toBe(true);
  });
});

describe('art mode', () => {
  it('is off without the setting, always on with an empty one, and keeps to its hours with both times', () => {
    expect(artModeActive({}, at('12:00'))).toBe(false);
    expect(artModeActive({ artMode: {} }, at('12:00'))).toBe(true);
    const nightly = { artMode: { from: '21:00', until: '07:00' } };
    expect(artModeActive(nightly, at('12:00'))).toBe(false);
    expect(artModeActive(nightly, at('23:00'))).toBe(true);
    // Half a pair of times is not hours: art mode is simply on.
    expect(artModeActive({ artMode: { from: '21:00' } }, at('12:00'))).toBe(true);
  });

  it('hides the screen dots only when the screen asks for it and art mode is on now', () => {
    expect(artModeHidesDots({}, at('12:00'))).toBe(false);
    expect(artModeHidesDots({ artMode: {} }, at('12:00'))).toBe(false);
    expect(artModeHidesDots({ artMode: { hideDots: true } }, at('12:00'))).toBe(true);
    const nightly = { artMode: { from: '21:00', until: '07:00', hideDots: true } };
    expect(artModeHidesDots(nightly, at('23:00'))).toBe(true);
    // Outside its hours the screen has its modules back, and its dots.
    expect(artModeHidesDots(nightly, at('12:00'))).toBe(false);
  });
});
