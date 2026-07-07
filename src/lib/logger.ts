/**
 * Tiny tagged console wrapper. `logger('subsystem')` returns level methods that
 * emit `console.<level>('[subsystem]', ...args)`, standardizing the ad-hoc
 * `[subsystem]` bracket-tag prefixes scattered across the codebase.
 *
 * IMPORTANT: this MUST stay a thin pass-through that reads `console[level]` at
 * call time. `src/lib/console-buffer.ts` patches the global console methods so
 * kiosk displays can capture and ship logs to the hub, and that patch may
 * install AFTER this module is imported. Never cache console method references
 * at module load, and never reimplement console behavior here — always call
 * through to the (possibly patched) console.
 *
 * Convention: the tag names a subsystem/feature and matches the existing
 * bracket-tags (e.g. 'ical', 'plugin', 'google-auth'). Dependency-free and
 * isomorphic — safe from server routes, libs, client components, and hooks.
 */

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function logger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    log: (...args: unknown[]) => console.log(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
