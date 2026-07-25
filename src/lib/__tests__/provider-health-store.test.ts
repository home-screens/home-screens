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

/**
 * `clear(pluginId)` is the uninstall/reload path. It exists because a
 * `report({ok:true})` is the only other way an entry leaves the store, and an
 * uninstalled plugin can never send one — so without it, uninstalling during an
 * outage left "service unreachable" next to the affected conditions forever.
 */
describe('providerHealthStore.clear', () => {
  it('removes an entry and notifies subscribers', () => {
    providerHealthStore.report('ha', { ok: false, message: 'down', since: 1 });
    expect(providerHealthStore.snapshot().has('ha')).toBe(true);

    const spy = vi.fn();
    const unsub = providerHealthStore.subscribe(spy);
    providerHealthStore.clear('ha');

    expect(providerHealthStore.snapshot().has('ha')).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('matches the lowercasing that report() applied when storing', () => {
    // `report` lowercases the id, so a caller passing the manifest's original
    // casing must still hit the stored key. Drop the toLowerCase and the entry
    // survives an uninstall — a banner nothing can ever clear.
    providerHealthStore.report('HomeAssistant', { ok: false, message: 'down', since: 1 });
    expect(providerHealthStore.snapshot().has('homeassistant')).toBe(true);

    providerHealthStore.clear('HomeAssistant');
    expect(providerHealthStore.snapshot().has('homeassistant')).toBe(false);
  });

  it('is a silent no-op for an unknown id or a non-string', () => {
    const spy = vi.fn();
    const unsub = providerHealthStore.subscribe(spy);
    providerHealthStore.clear('never-reported');
    providerHealthStore.clear(undefined as unknown as string);
    // No entry changed, so no re-render is provoked.
    expect(spy).not.toHaveBeenCalled();
    unsub();
  });

  it('leaves other plugins untouched', () => {
    providerHealthStore.report('ha', { ok: false, message: 'down', since: 1 });
    providerHealthStore.report('strava', { ok: false, message: 'down', since: 1 });
    providerHealthStore.clear('ha');
    expect(providerHealthStore.snapshot().has('ha')).toBe(false);
    expect(providerHealthStore.snapshot().has('strava')).toBe(true);
  });
});
