import { describe, it, expect } from 'vitest';
import { ALERT_DURATION_CHOICES_MS, defaultAlertDurationMs, nearestAlertDurationChoice } from '../alert-defaults';

describe('defaultAlertDurationMs', () => {
  it('gives each type its own length while the household default is 0 or unset', () => {
    expect(defaultAlertDurationMs('info', 0)).toBe(10_000);
    expect(defaultAlertDurationMs('warning', 0)).toBe(30_000);
    expect(defaultAlertDurationMs('urgent', 0)).toBe(0);
    expect(defaultAlertDurationMs('warning', undefined)).toBe(30_000);
  });

  it('uses the household default for every type once it is set', () => {
    for (const type of ['info', 'warning', 'urgent'] as const) {
      expect(defaultAlertDurationMs(type, 60_000)).toBe(60_000);
    }
  });
});

describe('nearestAlertDurationChoice', () => {
  it('keeps a length the chips already hold', () => {
    for (const choice of ALERT_DURATION_CHOICES_MS) expect(nearestAlertDurationChoice(choice)).toBe(choice);
  });

  it('goes to the closest chip, and to the longer one when halfway', () => {
    expect(nearestAlertDurationChoice(5_000)).toBe(10_000);
    expect(nearestAlertDurationChoice(15_000)).toBe(10_000);
    expect(nearestAlertDurationChoice(20_000)).toBe(30_000);
    expect(nearestAlertDurationChoice(45_000)).toBe(60_000);
    expect(nearestAlertDurationChoice(120_000)).toBe(60_000);
    expect(nearestAlertDurationChoice(200_000)).toBe(300_000);
  });

  it('never turns a timed default into one that stays up', () => {
    expect(nearestAlertDurationChoice(1)).toBe(10_000);
    expect(nearestAlertDurationChoice(0)).toBe(0);
  });
});
