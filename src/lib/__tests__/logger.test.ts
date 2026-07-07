import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes every level with the bracketed tag and forwards args', () => {
    const spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    const log = logger('subsys');
    log.debug('d', 1);
    log.info('i', 2);
    log.log('l', 3);
    log.warn('w', 4);
    log.error('e', 5);

    expect(spies.debug).toHaveBeenCalledWith('[subsys]', 'd', 1);
    expect(spies.info).toHaveBeenCalledWith('[subsys]', 'i', 2);
    expect(spies.log).toHaveBeenCalledWith('[subsys]', 'l', 3);
    expect(spies.warn).toHaveBeenCalledWith('[subsys]', 'w', 4);
    expect(spies.error).toHaveBeenCalledWith('[subsys]', 'e', 5);
  });

  it('calls through to a console patch installed AFTER logger creation (buffer-compat)', () => {
    // Logger is created first; the console method is only patched afterward.
    const log = logger('late');
    const original = console.warn;
    const seen: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      seen.push(args);
    };
    try {
      log.warn('hello', 'world');
    } finally {
      console.warn = original;
    }
    expect(seen).toEqual([['[late]', 'hello', 'world']]);
  });
});
