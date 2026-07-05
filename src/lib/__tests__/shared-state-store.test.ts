import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sharedStateStore } from '../shared-state-store';

describe('sharedStateStore', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('publishes and reads back a value', () => {
    sharedStateStore.publish('plugin:ha:door', 'alert');
    expect(sharedStateStore.get('plugin:ha:door')?.value).toBe('alert');
    expect(sharedStateStore.get('plugin:ha:door')?.updatedAt).toBeTypeOf('number');
  });

  it('replays current state via snapshot for late consumers', () => {
    sharedStateStore.publish('sensor.temp', '72');
    const snap = sharedStateStore.snapshot();
    expect(snap.get('sensor.temp')?.value).toBe('72');
  });

  it('notifies subscribers on publish', () => {
    const fn = vi.fn();
    sharedStateStore.subscribe(fn);
    sharedStateStore.publish('a.key', '1');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const fn = vi.fn();
    const unsub = sharedStateStore.subscribe(fn);
    unsub();
    sharedStateStore.publish('a.key', '1');
    expect(fn).not.toHaveBeenCalled();
  });

  it('coalesces identical re-publishes (no notify)', () => {
    sharedStateStore.publish('a.key', 'same');
    const fn = vi.fn();
    sharedStateStore.subscribe(fn);
    sharedStateStore.publish('a.key', 'same');
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects keys outside the allowed format', () => {
    sharedStateStore.publish('Bad Key!', 'x');
    sharedStateStore.publish('UPPER', 'x');
    sharedStateStore.publish('', 'x');
    sharedStateStore.publish('k'.repeat(129), 'x');
    expect(sharedStateStore.snapshot().size).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('truncates values past the 1KB cap', () => {
    sharedStateStore.publish('big.value', 'x'.repeat(2000));
    expect(sharedStateStore.get('big.value')?.value).toHaveLength(1024);
    expect(console.warn).toHaveBeenCalled();
  });

  it('drops new keys past the 256-key cap but still updates existing ones', () => {
    for (let i = 0; i < 256; i++) {
      sharedStateStore.publish(`key.${i}`, 'v');
    }
    sharedStateStore.publish('key.overflow', 'v');
    expect(sharedStateStore.get('key.overflow')).toBeUndefined();
    // Existing keys can still change value at the cap
    sharedStateStore.publish('key.0', 'updated');
    expect(sharedStateStore.get('key.0')?.value).toBe('updated');
  });

  it('snapshot is referentially stable across calls until state changes', () => {
    sharedStateStore.publish('a.key', '1');
    const first = sharedStateStore.snapshot();
    expect(sharedStateStore.snapshot()).toBe(first);

    // Identical re-publish must NOT invalidate the cached snapshot
    sharedStateStore.publish('a.key', '1');
    expect(sharedStateStore.snapshot()).toBe(first);

    // A real change must produce a new reference
    sharedStateStore.publish('a.key', '2');
    expect(sharedStateStore.snapshot()).not.toBe(first);
    expect(sharedStateStore.snapshot().get('a.key')?.value).toBe('2');
  });

  it('clearKey tombstones the key (value survives), then deletes after the grace window', () => {
    vi.useFakeTimers();
    sharedStateStore.publish('a.key', '1');
    const fn = vi.fn();
    sharedStateStore.subscribe(fn);
    sharedStateStore.clearKey('a.key');
    // Grace window: last value still visible, marked stale
    expect(sharedStateStore.get('a.key')?.value).toBe('1');
    expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
    expect(fn).toHaveBeenCalledTimes(1);
    // Re-clearing an already-tombstoned key is a no-op (no extra notify,
    // no timer extension)
    sharedStateStore.clearKey('a.key');
    expect(fn).toHaveBeenCalledTimes(1);
    // After the TTL with no fresh publish, the key is deleted for real
    vi.advanceTimersByTime(15_000);
    expect(sharedStateStore.get('a.key')).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('a fresh publish revives a tombstoned key and cancels the deletion', () => {
    vi.useFakeTimers();
    sharedStateStore.publish('a.key', '1');
    sharedStateStore.clearKey('a.key');
    sharedStateStore.publish('a.key', '1'); // same value must NOT be coalesced away
    expect(sharedStateStore.get('a.key')?.staleAt).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(sharedStateStore.get('a.key')?.value).toBe('1');
  });

  it('clearing a missing key is a silent no-op', () => {
    const fn = vi.fn();
    sharedStateStore.subscribe(fn);
    sharedStateStore.clearKey('a.key');
    expect(fn).not.toHaveBeenCalled();
  });

  it('subscribe/snapshot work unbound (useSyncExternalStore contract)', () => {
    const { subscribe, snapshot, publish } = sharedStateStore;
    const fn = vi.fn();
    subscribe(fn);
    publish('a.key', '1');
    expect(fn).toHaveBeenCalled();
    expect(snapshot().get('a.key')?.value).toBe('1');
  });

  describe('claim/release ownership', () => {
    it('keeps the value while another claim is still held', () => {
      const releaseA = sharedStateStore.claim('a.key');
      const releaseB = sharedStateStore.claim('a.key');
      sharedStateStore.publish('a.key', '1');
      releaseA();
      expect(sharedStateStore.get('a.key')?.value).toBe('1');
      expect(sharedStateStore.get('a.key')?.staleAt).toBeUndefined();
      releaseB();
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
    });

    it('releasing the last claim tombstones the key and notifies; TTL deletes it', () => {
      vi.useFakeTimers();
      const release = sharedStateStore.claim('a.key');
      sharedStateStore.publish('a.key', '1');
      const fn = vi.fn();
      sharedStateStore.subscribe(fn);
      release();
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('a.key')).toBeUndefined();
    });

    it('release is idempotent (double-release cannot underflow a second claimant)', () => {
      const releaseA = sharedStateStore.claim('a.key');
      const releaseB = sharedStateStore.claim('a.key');
      sharedStateStore.publish('a.key', '1');
      releaseA();
      releaseA();
      expect(sharedStateStore.get('a.key')?.value).toBe('1');
      expect(sharedStateStore.get('a.key')?.staleAt).toBeUndefined();
      releaseB();
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
    });

    it('claim on an invalid key is a no-op', () => {
      const release = sharedStateStore.claim('UPPER');
      sharedStateStore.publish('a.key', '1');
      release();
      expect(sharedStateStore.get('a.key')?.value).toBe('1');
    });

    it('publish without claim then release still clears (single claimant)', () => {
      vi.useFakeTimers();
      sharedStateStore.publish('a.key', '1');
      const release = sharedStateStore.claim('a.key');
      release();
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('a.key')).toBeUndefined();
    });

    it('clearKey drops an outstanding claim count (unconditional teardown)', () => {
      vi.useFakeTimers();
      const release = sharedStateStore.claim('a.key');
      sharedStateStore.publish('a.key', '1');
      sharedStateStore.clearKey('a.key');
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
      // Late release of the dropped claim must not throw or resurrect anything
      release();
      expect(sharedStateStore.get('a.key')?.staleAt).toBeTypeOf('number');
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('a.key')).toBeUndefined();
    });
  });

  describe('clearKeysByPrefix', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('tombstones only matching keys with a single notify', () => {
      sharedStateStore.publish('plugin:ha:door', 'open');
      sharedStateStore.publish('plugin:ha:temp', '72');
      sharedStateStore.publish('plugin:other:door', 'closed');
      const fn = vi.fn();
      sharedStateStore.subscribe(fn);
      sharedStateStore.clearKeysByPrefix('plugin:ha:');
      expect(sharedStateStore.get('plugin:ha:door')?.staleAt).toBeTypeOf('number');
      expect(sharedStateStore.get('plugin:ha:temp')?.staleAt).toBeTypeOf('number');
      expect(sharedStateStore.get('plugin:other:door')?.staleAt).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('plugin:ha:door')).toBeUndefined();
      expect(sharedStateStore.get('plugin:ha:temp')).toBeUndefined();
      expect(sharedStateStore.get('plugin:other:door')?.value).toBe('closed');
    });

    it('is a silent no-op when nothing matches', () => {
      sharedStateStore.publish('plugin:other:door', 'closed');
      const fn = vi.fn();
      sharedStateStore.subscribe(fn);
      sharedStateStore.clearKeysByPrefix('plugin:ha:');
      expect(fn).not.toHaveBeenCalled();
    });

    it('also drops claim counts under the prefix', () => {
      const release = sharedStateStore.claim('plugin:ha:door');
      sharedStateStore.publish('plugin:ha:door', 'open');
      sharedStateStore.clearKeysByPrefix('plugin:ha:');
      expect(sharedStateStore.get('plugin:ha:door')?.staleAt).toBeTypeOf('number');
      release();
      expect(sharedStateStore.get('plugin:ha:door')?.staleAt).toBeTypeOf('number');
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.get('plugin:ha:door')).toBeUndefined();
    });
  });
});
