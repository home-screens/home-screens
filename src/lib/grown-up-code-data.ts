import crypto from 'crypto';
import { createJsonStore } from './json-store';
import { safeEqual, signPayload, verifySignedPayload } from './signed-payload';
import {
  DEFAULT_GROWN_UP_ACTIONS,
  DEFAULT_UNLOCK_MINUTES,
  NO_GROWN_UP_CODE,
  cleanGrownUpActions,
  cleanUnlockMinutes,
  type GrownUpAction,
  type GrownUpStatus,
} from './grown-up-code';

/**
 * `data/grown-up-code.json`: the code's hash and salt, the secret its unlocks
 * are signed with, and what it guards. One file, so what the wall is told
 * (`readGrownUpStatus`) and what the hub enforces can never disagree, and it
 * stays out of `config.json`, which every wall reads: a hash of four digits
 * is ten thousand guesses away from the code. Mode 600, never sent anywhere,
 * and not part of a backup (like the password), so a restore keeps the
 * hub's own code.
 */
interface GrownUpCodeFile {
  hash: string | null;
  salt: string | null;
  /** Signs the unlocks; a new one with every new code, so old unlocks stop working. */
  secret: string | null;
  actions: GrownUpAction[];
  unlockMinutes: number;
}

const EMPTY: GrownUpCodeFile = { hash: null, salt: null, secret: null, actions: [], unlockMinutes: DEFAULT_UNLOCK_MINUTES };

const store = createJsonStore<GrownUpCodeFile>({
  path: 'data/grown-up-code.json',
  defaultValue: EMPTY,
  chmod: 0o600,
  errorHandling: 'throw-corrupt',
});

const HASH_KEYLEN = 64;

function hashCode(code: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(code, salt, HASH_KEYLEN, (err, key) => (err ? reject(err) : resolve(key.toString('hex'))));
  });
}

function isSet(file: GrownUpCodeFile): file is GrownUpCodeFile & { hash: string; salt: string; secret: string } {
  return !!file.hash && !!file.salt && !!file.secret;
}

function statusOf(file: GrownUpCodeFile): GrownUpStatus {
  if (!isSet(file)) return NO_GROWN_UP_CODE;
  return {
    set: true,
    actions: cleanGrownUpActions(file.actions) ?? [],
    unlockMinutes: cleanUnlockMinutes(file.unlockMinutes) ?? DEFAULT_UNLOCK_MINUTES,
  };
}

export async function readGrownUpStatus(): Promise<GrownUpStatus> {
  return statusOf(await store.read());
}

/**
 * Sets a new code (or changes it), keeping the jobs and unlock length it had,
 * or the defaults for a first code. Earlier unlocks stop working.
 */
export async function setGrownUpCode(code: string): Promise<GrownUpStatus> {
  const before = await store.read();
  const salt = crypto.randomBytes(32).toString('hex');
  const next: GrownUpCodeFile = {
    hash: await hashCode(code, salt),
    salt,
    secret: crypto.randomBytes(32).toString('hex'),
    actions: isSet(before) ? cleanGrownUpActions(before.actions) ?? [] : [...DEFAULT_GROWN_UP_ACTIONS],
    unlockMinutes: isSet(before) ? cleanUnlockMinutes(before.unlockMinutes) ?? DEFAULT_UNLOCK_MINUTES : DEFAULT_UNLOCK_MINUTES,
  };
  await store.write(next);
  return statusOf(next);
}

/** Changes what an existing code guards or how long it unlocks; null when no code is set. */
export async function updateGrownUpPrefs(prefs: { actions?: GrownUpAction[]; unlockMinutes?: number }): Promise<GrownUpStatus | null> {
  const before = await store.read();
  if (!isSet(before)) return null;
  const next: GrownUpCodeFile = {
    ...before,
    ...(prefs.actions ? { actions: prefs.actions } : {}),
    ...(prefs.unlockMinutes ? { unlockMinutes: prefs.unlockMinutes } : {}),
  };
  await store.write(next);
  return statusOf(next);
}

export async function removeGrownUpCode(): Promise<void> {
  await store.write(EMPTY);
}

interface UnlockPayload {
  scope: 'grown-up';
  exp: number;
}

/**
 * Checks a code. A right one is answered with an unlock, signed by the hub,
 * that the ticked jobs accept until `expiresAt`.
 */
export async function checkGrownUpCode(code: string): Promise<{ ok: true; token: string; expiresAt: number } | { ok: false; reason: 'wrong' | 'none' }> {
  const file = await store.read();
  if (!isSet(file)) return { ok: false, reason: 'none' };
  const hash = await hashCode(code, file.salt);
  if (!safeEqual(hash, file.hash)) return { ok: false, reason: 'wrong' };
  const expiresAt = Date.now() + statusOf(file).unlockMinutes * 60_000;
  const payload: UnlockPayload = { scope: 'grown-up', exp: expiresAt };
  return { ok: true, token: signPayload(payload, file.secret), expiresAt };
}

/** True for an unlock this hub signed for its current code that has not run out. */
export async function isGrownUpUnlock(token: string): Promise<boolean> {
  const file = await store.read();
  if (!isSet(file)) return false;
  const payload = verifySignedPayload(token, file.secret) as Partial<UnlockPayload> | null;
  return !!payload && payload.scope === 'grown-up' && typeof payload.exp === 'number' && payload.exp > Date.now();
}
