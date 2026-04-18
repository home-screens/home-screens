/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installConsoleBuffer, snapshotConsoleBuffer, __resetConsoleBufferForTests } from '@/lib/console-buffer';

describe('console-buffer', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    __resetConsoleBufferForTests();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it('captures subsequent console.log/warn/error calls', () => {
    uninstall = installConsoleBuffer({ maxEntries: 10, maxBytes: 64 * 1024 });
    console.log('hello');
    console.warn('watch out');
    console.error('boom');
    const snap = snapshotConsoleBuffer();
    expect(snap.map((e) => e.level)).toEqual(['log', 'warn', 'error']);
    expect(snap.map((e) => e.message)).toEqual(['hello', 'watch out', 'boom']);
  });

  it('keeps the original console behavior (spy still sees the call)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    uninstall = installConsoleBuffer({ maxEntries: 10, maxBytes: 64 * 1024 });
    console.log('forwarded');
    expect(spy).toHaveBeenCalledWith('forwarded');
    spy.mockRestore();
  });

  it('drops oldest entries past maxEntries cap', () => {
    uninstall = installConsoleBuffer({ maxEntries: 3, maxBytes: 64 * 1024 });
    console.log('1'); console.log('2'); console.log('3'); console.log('4'); console.log('5');
    const snap = snapshotConsoleBuffer();
    expect(snap.map((e) => e.message)).toEqual(['3', '4', '5']);
  });

  it('drops oldest entries once byte budget is exceeded', () => {
    uninstall = installConsoleBuffer({ maxEntries: 1000, maxBytes: 40 });
    console.log('abcdefghij');   // ~10B
    console.log('klmnopqrst');   // ~10B
    console.log('uvwxyz0123');   // ~10B
    console.log('4567890abc');   // ~10B — tips us over 40 B total
    const snap = snapshotConsoleBuffer();
    // Expect at least the last entry retained; older entries evicted.
    expect(snap.length).toBeGreaterThanOrEqual(1);
    expect(snap.length).toBeLessThan(4);
    expect(snap[snap.length - 1].message).toContain('4567890');
  });

  it('serializes object arguments via JSON.stringify (falls back to String() on cycle)', () => {
    uninstall = installConsoleBuffer({ maxEntries: 10, maxBytes: 64 * 1024 });
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    console.log('obj:', { a: 1 }, cyc);
    const snap = snapshotConsoleBuffer();
    expect(snap[0].message).toContain('obj:');
    expect(snap[0].message).toContain('{"a":1}');
    expect(snap[0].message).toContain('[object Object]');
  });
});
