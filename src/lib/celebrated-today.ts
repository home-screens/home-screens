/**
 * Who has already been celebrated today, kept in the browser so a reload,
 * a screen rotation or a tab switch does not hand a kid a second party for
 * un-ticking and re-ticking the same chore. One key per day; other days are
 * dropped on the first write of a new one. Storage can be missing or refuse
 * (a private window, a kiosk with site data off), so every call falls back
 * to an in-memory set and the chart still works.
 */

const PREFIX = 'hs-celebrated-';
const memory = new Map<string, Set<string>>();

function read(date: string): Set<string> {
  let set = memory.get(date);
  if (set) return set;
  set = new Set<string>();
  try {
    const raw = window.localStorage.getItem(PREFIX + date);
    if (raw) for (const id of JSON.parse(raw) as unknown[]) if (typeof id === 'string') set.add(id);
  } catch { /* no storage: memory only */ }
  memory.set(date, set);
  return set;
}

/** Whether this person's finish today was already celebrated on this device. */
export function wasCelebratedToday(memberId: string, date: string): boolean {
  return read(date).has(memberId);
}

/** Remember a celebration, and forget every other day's. */
export function rememberCelebrated(memberId: string, date: string): void {
  const set = read(date);
  set.add(memberId);
  for (const other of [...memory.keys()]) if (other !== date) memory.delete(other);
  try {
    const store = window.localStorage;
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX) && key !== PREFIX + date) store.removeItem(key);
    }
    store.setItem(PREFIX + date, JSON.stringify([...set]));
  } catch { /* no storage: memory only */ }
}

/** A failed save hands the chance back: the finish did not happen. */
export function forgetCelebrated(memberId: string, date: string): void {
  read(date).delete(memberId);
  try {
    window.localStorage.setItem(PREFIX + date, JSON.stringify([...read(date)]));
  } catch { /* no storage: memory only */ }
}
