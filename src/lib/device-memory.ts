/**
 * Small picks a phone or a computer keeps for itself in `localStorage`: the
 * person last chosen, the wall last sent to, which lists are folded. Private
 * mode, blocked storage or a render on the hub all mean the same thing:
 * nothing is remembered, and nothing throws.
 */

/** The remembered text, or null when there is none or storage cannot be read. An empty string is a saved value. */
export function readRemembered(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keep `value` under `key`. A pick that cannot be stored just does not stick. */
export function remember(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode or storage switched off */
  }
}

/** A remembered JSON value, or null when there is none or it cannot be read. The caller checks its shape. */
export function readRememberedJson(key: string): unknown {
  const raw = readRemembered(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function rememberJson(key: string, value: unknown): void {
  remember(key, JSON.stringify(value));
}
