import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { subscribeAlignedTick, msUntilNextTick, armedCadenceCount, TICK_SLACK_MS } from '../aligned-ticker';

describe('aligned ticker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T12:00:40.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aims just past the next boundary of the period', () => {
    expect(msUntilNextTick(60_000)).toBe(20_000 + TICK_SLACK_MS);
    expect(msUntilNextTick(1000, Date.parse('2026-10-29T12:00:40.300Z'))).toBe(700 + TICK_SLACK_MS);
    expect(msUntilNextTick(600_000)).toBe(9 * 60_000 + 20_000 + TICK_SLACK_MS);
  });

  it('ticks at the minute boundary, not a minute after subscribing', () => {
    const ticks: number[] = [];
    const stop = subscribeAlignedTick(60_000, () => ticks.push(Date.now()));
    vi.advanceTimersByTime(19_999);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1 + TICK_SLACK_MS);
    expect(ticks).toEqual([Date.parse('2026-10-29T12:01:00.005Z')]);
    vi.advanceTimersByTime(60_000);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]).toBe(Date.parse('2026-10-29T12:02:00.005Z'));
    stop();
  });

  it('shares one timer between subscribers of the same period and clears it with the last', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeAlignedTick(60_000, a);
    const stopB = subscribeAlignedTick(60_000, b);
    const stopC = subscribeAlignedTick(1000, () => {});
    expect(vi.getTimerCount()).toBe(2);
    expect(armedCadenceCount()).toBe(2);
    vi.advanceTimersByTime(20_005);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    vi.advanceTimersByTime(60_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    stopB();
    stopC();
    expect(vi.getTimerCount()).toBe(0);
    expect(armedCadenceCount()).toBe(0);
  });

  it('re-aims from the real time after the clock steps', () => {
    const ticks: number[] = [];
    const stop = subscribeAlignedTick(1000, () => ticks.push(Date.now()));
    // The clock jumps 30.3 s (an NTP correction) before the armed timer
    // fires, so that tick lands off the boundary; the next one is aimed
    // from where the clock is now, back on a whole second.
    vi.setSystemTime(new Date('2026-10-29T12:01:10.300Z'));
    vi.advanceTimersToNextTimer();
    expect(ticks).toEqual([Date.parse('2026-10-29T12:01:11.305Z')]);
    vi.advanceTimersToNextTimer();
    expect(ticks[1]).toBe(Date.parse('2026-10-29T12:01:12.005Z'));
    stop();
  });

  it('ignores a listener unsubscribed by another listener in the same tick', () => {
    const calls: string[] = [];
    let stopB = () => {};
    subscribeAlignedTick(1000, () => { calls.push('a'); stopB(); });
    stopB = subscribeAlignedTick(1000, () => calls.push('b'));
    vi.advanceTimersByTime(1000 + TICK_SLACK_MS);
    // The snapshot taken before the loop still delivers to b this tick; the
    // next tick does not.
    expect(calls).toEqual(['a', 'b']);
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['a', 'b', 'a']);
  });
});
