import { describe, it, expect, beforeEach, vi } from 'vitest';
import { providerHealthStore, type ProviderHealthStatus } from '@/lib/provider-health-store';

describe('providerHealthStore', () => {
  beforeEach(() => {
    providerHealthStore.__resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('records an unhealthy report and clears it on recovery', () => {
    providerHealthStore.report('home-assistant', { ok: false, message: 'down', since: 100 });
    expect(providerHealthStore.snapshot().get('home-assistant')).toEqual({ message: 'down', since: 100 });

    providerHealthStore.report('home-assistant', { ok: true });
    expect(providerHealthStore.snapshot().has('home-assistant')).toBe(false);
  });

  it('lowercases the plugin id so it matches the bus namespace', () => {
    providerHealthStore.report('Home-Assistant', { ok: false, message: 'down', since: 1 });
    expect(providerHealthStore.snapshot().has('home-assistant')).toBe(true);
  });

  it('rejects an out-of-charset plugin id without throwing', () => {
    expect(() =>
      providerHealthStore.report('bad id/../x', { ok: false, message: 'x', since: 1 }),
    ).not.toThrow();
    expect(providerHealthStore.snapshot().size).toBe(0);
  });

  it('caps the message length and coerces a non-string message', () => {
    const long = 'a'.repeat(500);
    providerHealthStore.report('p', { ok: false, message: long, since: 1 });
    expect(providerHealthStore.snapshot().get('p')!.message.length).toBe(200);

    providerHealthStore.report('q', { ok: false, message: 42 as unknown as string, since: 1 });
    expect(providerHealthStore.snapshot().get('q')!.message).toBe('42');
  });

  it('clamps a future or non-finite since to now', () => {
    const now = Date.now();
    providerHealthStore.report('future', { ok: false, message: 'x', since: now + 1_000_000 });
    expect(providerHealthStore.snapshot().get('future')!.since).toBeLessThanOrEqual(Date.now());

    providerHealthStore.report('nan', { ok: false, message: 'x', since: Infinity as unknown as number });
    const since = providerHealthStore.snapshot().get('nan')!.since;
    expect(Number.isFinite(since)).toBe(true);
    expect(since).toBeLessThanOrEqual(Date.now());
  });

  it('does not throw on a garbage status payload', () => {
    expect(() =>
      providerHealthStore.report('p', null as unknown as ProviderHealthStatus),
    ).not.toThrow();
    expect(providerHealthStore.snapshot().size).toBe(0);
  });

  it('coalesces identical re-reports (no subscriber churn)', () => {
    const spy = vi.fn();
    const unsub = providerHealthStore.subscribe(spy);
    providerHealthStore.report('p', { ok: false, message: 'down', since: 5 });
    expect(spy).toHaveBeenCalledTimes(1);
    // Same outage re-reported on the next failure — no notify.
    providerHealthStore.report('p', { ok: false, message: 'down', since: 5 });
    expect(spy).toHaveBeenCalledTimes(1);
    // A changed message does notify.
    providerHealthStore.report('p', { ok: false, message: 'still down', since: 5 });
    expect(spy).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('keeps the snapshot reference stable until something changes', () => {
    const a = providerHealthStore.snapshot();
    expect(providerHealthStore.snapshot()).toBe(a);
    providerHealthStore.report('p', { ok: false, message: 'down', since: 1 });
    const b = providerHealthStore.snapshot();
    expect(b).not.toBe(a);
    expect(providerHealthStore.snapshot()).toBe(b);
  });

  it('an ok report for an already-healthy plugin is a no-op (no notify)', () => {
    const spy = vi.fn();
    const unsub = providerHealthStore.subscribe(spy);
    providerHealthStore.report('p', { ok: true });
    expect(spy).not.toHaveBeenCalled();
    unsub();
  });
});
