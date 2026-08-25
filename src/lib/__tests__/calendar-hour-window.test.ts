import { describe, it, expect } from 'vitest';
import { resolveHourWindow } from '@/lib/calendar-hour-window';

const fixed = { fixedStart: 6, fixedEnd: 22, todayVisible: true };

describe('resolveHourWindow', () => {
  it('fixed mode returns the configured hours untouched', () => {
    expect(resolveHourWindow({ mode: 'fixed', rollingHours: 8, nowHour: 15.5, ...fixed }))
      .toEqual({ hourStart: 6, hourEnd: 22, rolling: false });
    expect(resolveHourWindow({ mode: undefined, rollingHours: 8, nowHour: 15.5, ...fixed }).rolling).toBe(false);
  });

  it('rolling starts one hour before the current hour', () => {
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 8, nowHour: 15.67, ...fixed }))
      .toEqual({ hourStart: 14, hourEnd: 22, rolling: true });
  });

  it('rolling clamps to the start and end of the day', () => {
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 8, nowHour: 0.2, ...fixed }))
      .toEqual({ hourStart: 0, hourEnd: 8, rolling: true });
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 8, nowHour: 23.5, ...fixed }))
      .toEqual({ hourStart: 16, hourEnd: 24, rolling: true });
  });

  it('rolling window length is clamped to 4..16 and defaults to 8', () => {
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 1, nowHour: 12, ...fixed }).hourEnd).toBe(15);
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 40, nowHour: 12, ...fixed })).toEqual({ hourStart: 8, hourEnd: 24, rolling: true });
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: undefined, nowHour: 12, ...fixed })).toEqual({ hourStart: 11, hourEnd: 19, rolling: true });
  });

  it('falls back to the fixed hours when today is not on screen', () => {
    expect(resolveHourWindow({ mode: 'rolling', rollingHours: 8, nowHour: 15, fixedStart: 6, fixedEnd: 22, todayVisible: false }))
      .toEqual({ hourStart: 6, hourEnd: 22, rolling: false });
  });
});
