/**
 * The last time something sent a display key that doesn't match, and from
 * where. Home Assistant, a shortcut or a bookmark holding an old key fails
 * with nothing on screen, so Settings > Security names it: "Something at
 * 192.168.1.40 tried a key that doesn't match, 3 minutes ago."
 *
 * Per-process: a restart forgets it, and the next refused call records it
 * again. On globalThis because the routes that refuse a key and the one that
 * reports it can hold separate copies of this module.
 */
export interface RefusedKey {
  /** Epoch milliseconds. */
  at: number;
  /** The caller's address, when the route knew it. */
  address: string | null;
}

const key = Symbol.for('home-screens.display-key-refusals.v1');
const globals = globalThis as typeof globalThis & { [key]?: { last: RefusedKey | null } };
const state = (globals[key] ??= { last: null });

/** Record a request turned away while carrying a display key that doesn't match. */
export function noteRefusedKey(address: string | null | undefined, now = Date.now()): void {
  state.last = { at: now, address: address || null };
}

/** The last refused key, or null. */
export function lastRefusedKey(): RefusedKey | null {
  return state.last;
}

export function __resetRefusedKeyForTests(): void {
  state.last = null;
}
