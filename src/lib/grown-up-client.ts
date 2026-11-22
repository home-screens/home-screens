import { GROWN_UP_HEADER } from './grown-up-code';

/**
 * The asking side of the grown-up code, shared by the wall, the kids' chores
 * page and the phone. A write goes out through `grownUpFetch`: it carries
 * this tab's unlock when it has one, and when the hub answers that the job
 * needs the code, it asks (through whichever pad the surface mounted), then
 * sends the write again. The pages never decide what needs the code; the hub
 * does (`grown-up-gate.ts`), so a stale page cannot let a job through.
 */

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Nobody gave the code: the write was not sent, and nothing needs saying. */
export class GrownUpCancelled extends Error {
  constructor() {
    super('The grown-up code was not given');
    this.name = 'GrownUpCancelled';
  }
}

export function isGrownUpCancelled(error: unknown): boolean {
  return error instanceof GrownUpCancelled;
}

export interface GrownUpUnlock {
  token: string;
  /** Epoch ms. */
  expiresAt: number;
}

// One unlock per tab: a wall's unlock never reaches another wall or a phone.
let unlock: GrownUpUnlock | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** This tab's unlock while it lasts, else null. */
export function currentUnlock(): GrownUpUnlock | null {
  if (unlock && unlock.expiresAt <= Date.now()) {
    unlock = null;
  }
  return unlock;
}

export function setUnlock(next: GrownUpUnlock): void {
  unlock = next;
  if (expiry) clearTimeout(expiry);
  expiry = setTimeout(() => {
    expiry = null;
    if (unlock && unlock.expiresAt <= Date.now()) unlock = null;
    emit();
  }, Math.max(0, next.expiresAt - Date.now()) + 50);
  emit();
}

/** Locks this tab at once ("Lock now", or an unlock the hub turned down). */
export function lockNow(): void {
  if (expiry) clearTimeout(expiry);
  expiry = null;
  unlock = null;
  emit();
}

export function subscribeUnlock(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Shows the surface's pad and settles true once the hub said yes, false when nobody gave the code. */
export type GrownUpAsker = (why: string) => Promise<boolean>;

let asker: GrownUpAsker | null = null;

/** The surface's pad, mounted once (the wall's `GrownUpPadLayer`, the phone's sheet). */
export function registerGrownUpAsker(next: GrownUpAsker): () => void {
  asker = next;
  return () => {
    if (asker === next) asker = null;
  };
}

function askGrownUp(why: string): Promise<boolean> {
  if (!asker) {
    console.warn('[grown-up] a job needs the code, but no pad is mounted on this page');
    return Promise.resolve(false);
  }
  return asker(why);
}

function withUnlock(init: RequestInit | undefined): RequestInit {
  const current = currentUnlock();
  if (!current) return init ?? {};
  const headers = new Headers(init?.headers);
  headers.set(GROWN_UP_HEADER, current.token);
  return { ...init, headers };
}

/**
 * `fetcher`, for a write that may need the grown-up code. `why` is what the
 * pad says the code is for ("To spend 10 of Noah's tickets on Pick the
 * movie"). Throws `GrownUpCancelled` when nobody gave it.
 */
export function grownUpFetch<F extends Fetcher>(fetcher: F, why: string): Fetcher {
  return async (url, init) => {
    const res = await fetcher(url, withUnlock(init));
    if (res.status !== 403) return res;
    const body = await res.clone().json().catch(() => null) as { needsGrownUpCode?: boolean } | null;
    if (!body?.needsGrownUpCode) return res;
    lockNow();
    if (!(await askGrownUp(why))) throw new GrownUpCancelled();
    return fetcher(url, withUnlock(init));
  };
}
