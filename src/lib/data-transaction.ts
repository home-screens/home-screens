import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { acquireDataLock, DataLockBusyError, type DataLockHandle } from './data-lock';
import { DataTransactionError } from './family-errors';
export { DataTransactionError } from './family-errors';

export const DATA_JOURNAL_PATH = 'data/family-transaction.json';
export interface TransactionChange { path: string; before: string | null; after: string | null; mode?: number; dirMode?: number }
export interface TransactionStep { path: string; contents: string | null }
export interface DataTransactionPlan {
  kind: string;
  changes: TransactionChange[];
  steps?: TransactionStep[];
  evidence?: { path: string; contents: string };
  /** Handled restore failures decide rollback durably before undoing writes. */
  rollbackOnError?: boolean;
}
interface Journal extends DataTransactionPlan {
  version: 1;
  id: string;
  decision: 'commit' | 'rollback';
  fingerprints: Record<string, string>;
  checksum: string;
}
interface Context { root: string; active: boolean }
interface CoordinatorState {
  root?: string;
  context: AsyncLocalStorage<Context>;
  queues: Map<string, Promise<void>>;
  retryAfter: Map<string, number>;
  listeners: Set<() => void>;
  /** The lock this process holds for each root it is writing. */
  holders?: Map<string, DataLockHandle>;
}
const key = Symbol.for('home-screens.data-transaction.v1');
const globals = globalThis as typeof globalThis & { [key]?: CoordinatorState };
const state: CoordinatorState = globals[key] ??= { context: new AsyncLocalStorage<Context>(), queues: new Map(), retryAfter: new Map(), listeners: new Set(), holders: new Map() };
const holders = (state.holders ??= new Map());

/** Pin the application pathname at server/CLI startup, before a release swap
 * can move the working-directory inode into the rollback tree. */
export function pinDataRoot(root = process.env.HOME_SCREENS_DIR || process.cwd()): void {
  const resolved = path.resolve(root);
  if (state.root && state.root !== resolved) throw new Error('The application data root is already set.');
  state.root = resolved;
}

export function getDataRoot(): string {
  const inherited = state.context.getStore();
  return inherited?.active ? inherited.root : state.root ?? process.env.HOME_SCREENS_DIR ?? process.cwd();
}

const hash = (contents: string | null) => createHash('sha256').update(contents === null ? 'absent' : `file:${contents}`).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2);
const journalChecksum = (journal: Omit<Journal, 'checksum'> | Journal) => {
  const { checksum: _checksum, ...payload } = journal as Journal;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};
function context(): Context {
  const ctx = state.context.getStore();
  if (!ctx?.active) throw new Error('Raw data access requires withDataTransaction.');
  return ctx;
}
function resolveTarget(relative: string): string {
  const root = context().root;
  const resolved = path.resolve(root, relative);
  if (!relative.startsWith('data/') || !resolved.startsWith(path.join(root, 'data') + path.sep) || path.isAbsolute(relative)) {
    throw new DataTransactionError('The saved transaction contains an invalid file path.', 409);
  }
  return resolved;
}

export function onDataTransactionCommit(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
function invalidate() { for (const listener of state.listeners) listener(); }

/** Durable atomic writer: file sync, rename, then parent-directory sync. */
/**
 * Refuses to publish anything unless this process still holds the lock.
 * Checked at each write rather than once per operation: a write that lands
 * after the lock was lost has already happened, and reporting it does not
 * take it back.
 *
 * Transient stores opt out of the coordinator entirely, so they have no
 * ownership to lose and are left alone.
 */
export async function assertStillOwned(): Promise<void> {
  const ctx = state.context.getStore();
  if (!ctx?.active) return;
  const held = holders.get(ctx.root);
  if (!held) return;
  try { await held.assertOwned(); }
  catch (cause) {
    throw new DataTransactionError('Another update took over the settings files, so this one stopped before writing.', 503, { cause });
  }
}

export async function durableWriteFile(filePath: string, contents: string, mode?: number, dirMode?: number): Promise<void> {
  await assertStillOwned();
  const directory = path.dirname(filePath);
  const firstCreated = await fs.mkdir(directory, { recursive: true, mode: dirMode });
  // Sync newly-created directory entries up to their existing ancestor.
  // Existing directories need only the post-rename sync below.
  if (firstCreated) {
    const ancestor = path.dirname(firstCreated);
    for (let parent = path.dirname(directory); ; parent = path.dirname(parent)) {
      await syncDirectory(parent);
      if (parent === ancestor) break;
    }
  }
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    // Match ordinary fs.writeFile permissions unless the store requests a
    // private file. Journals and credentials always supply 0600 explicitly.
    handle = await fs.open(tmp, 'wx', mode ?? 0o666);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    // Again, immediately before the step that publishes. Staging the file can
    // take a while on slow storage, and ownership checked only at the start
    // would say nothing about whether this write is still allowed to land.
    await assertStillOwned();
    await fs.rename(tmp, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
}
async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function durableRemove(filePath: string) {
  await assertStillOwned();
  try { await fs.unlink(filePath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await syncDirectory(path.dirname(filePath));
}
export async function readTransactionFile(relative: string): Promise<string | null> {
  try { return await fs.readFile(resolveTarget(relative), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function writeImage(relative: string, contents: string | null, mode?: number, dirMode?: number) {
  const target = resolveTarget(relative);
  if (contents === null) await durableRemove(target); else await durableWriteFile(target, contents, mode, dirMode);
  if (await readTransactionFile(relative) !== contents) throw new DataTransactionError(`Could not verify ${relative}. Recovery will retry.`);
}
function validateJournal(value: unknown): asserts value is Journal {
  if (!value || typeof value !== 'object') throw new DataTransactionError('The saved family transaction is unreadable. Preserve it for recovery.', 409);
  const journal = value as Journal;
  if (journal.version !== 1 || typeof journal.id !== 'string' || typeof journal.kind !== 'string' || !['commit', 'rollback'].includes(journal.decision)
    || !Array.isArray(journal.changes) || !journal.fingerprints || typeof journal.fingerprints !== 'object') {
    throw new DataTransactionError('The saved family transaction is invalid. Preserve it for recovery.', 409);
  }
  if (typeof journal.checksum !== 'string' || journal.checksum !== journalChecksum(journal)) {
    throw new DataTransactionError('The saved family transaction failed its integrity check. Preserve it for recovery.', 409);
  }
  const paths = new Set<string>();
  for (const change of journal.changes) {
    if (!change || typeof change.path !== 'string' || change.path === DATA_JOURNAL_PATH || paths.has(change.path)
      || (change.before !== null && typeof change.before !== 'string') || (change.after !== null && typeof change.after !== 'string')
      || (change.mode !== undefined && (!Number.isInteger(change.mode) || change.mode < 0 || change.mode > 0o777))
      || (change.dirMode !== undefined && (!Number.isInteger(change.dirMode) || change.dirMode < 0 || change.dirMode > 0o777))
      || journal.fingerprints[change.path] !== hash(change.before)) throw new DataTransactionError('The saved family transaction has invalid file images.', 409);
    resolveTarget(change.path); paths.add(change.path);
  }
  if (journal.steps !== undefined) {
    if (!Array.isArray(journal.steps)) throw new DataTransactionError('The saved family transaction has invalid recovery steps.', 409);
    for (const step of journal.steps) {
      if (!step || !paths.has(step.path) || (step.contents !== null && typeof step.contents !== 'string')) throw new DataTransactionError('The saved family transaction has invalid recovery steps.', 409);
    }
    // Each path's last step must publish exactly its recorded final image.
    for (const change of journal.changes) {
      const steps = journal.steps.filter((step) => step.path === change.path);
      if (!steps.length || steps.at(-1)!.contents !== change.after) throw new DataTransactionError('The saved transaction has an incomplete recovery sequence.', 409);
    }
  }
  if (journal.evidence) {
    if (typeof journal.evidence.path !== 'string' || typeof journal.evidence.contents !== 'string'
      || journal.evidence.path === DATA_JOURNAL_PATH || paths.has(journal.evidence.path)) throw new DataTransactionError('The saved migration evidence is invalid.', 409);
    resolveTarget(journal.evidence.path);
  }
}
async function assertRecoverable(journal: Journal) {
  for (const change of journal.changes) {
    const current = await readTransactionFile(change.path);
    const allowed = [change.before, change.after, ...(journal.steps ?? []).filter((s) => s.path === change.path).map((s) => s.contents)];
    if (!allowed.includes(current)) throw new DataTransactionError(`${change.path} changed outside the pending transaction. Preserve both files and resolve the conflict before retrying.`, 409);
  }
}
async function replay(journal: Journal) {
  await assertRecoverable(journal);
  if (journal.decision === 'commit' && journal.evidence) {
    const current = await readTransactionFile(journal.evidence.path);
    if (current !== null && current !== journal.evidence.contents) throw new DataTransactionError('Existing family migration evidence differs from the saved transaction.', 409);
    if (current === null) await writeImage(journal.evidence.path, journal.evidence.contents, 0o600);
  }
  const steps = journal.decision === 'rollback'
    ? [...journal.changes].reverse().map((change) => ({ path: change.path, contents: change.before }))
    : journal.steps ?? journal.changes.map((change) => ({ path: change.path, contents: change.after }));
  for (const step of steps) {
    const change = journal.changes.find((change) => change.path === step.path);
    await writeImage(step.path, step.contents, change?.mode, change?.dirMode);
  }
  for (const change of journal.changes) {
    if (await readTransactionFile(change.path) !== (journal.decision === 'rollback' ? change.before : change.after)) {
      throw new DataTransactionError(`Could not verify all restored files: ${change.path}.`);
    }
  }
  await durableRemove(resolveTarget(DATA_JOURNAL_PATH));
  state.retryAfter.delete(context().root);
  invalidate();
}
async function recover() {
  const raw = await readTransactionFile(DATA_JOURNAL_PATH);
  if (raw === null) { state.retryAfter.delete(context().root); return; }
  if (Date.now() < (state.retryAfter.get(context().root) ?? 0)) throw new DataTransactionError('Family data recovery is pending. Please try again in a minute.');
  try {
    let journal: unknown;
    try { journal = JSON.parse(raw); } catch { throw new DataTransactionError('The saved family transaction is corrupt. Preserve it for recovery.', 409); }
    validateJournal(journal);
    await replay(journal);
  } catch (error) {
    state.retryAfter.set(context().root, Date.now() + 60_000);
    throw error;
  }
}

/** Call only inside the coordinator; sources are rechecked before the journal. */
export async function commitDataTransaction(plan: DataTransactionPlan): Promise<void> {
  context();
  if (await readTransactionFile(DATA_JOURNAL_PATH) !== null) throw new DataTransactionError('A family transaction is already pending.');
  const journal: Journal = { ...plan, version: 1, id: randomUUID(), decision: 'commit', fingerprints: Object.fromEntries(plan.changes.map((change) => [change.path, hash(change.before)])), checksum: '' };
  journal.checksum = journalChecksum(journal);
  validateJournal(journal);
  for (const change of plan.changes) {
    if (await readTransactionFile(change.path) !== change.before) throw new DataTransactionError(`${change.path} changed before the transaction could start. Please retry.`, 409);
  }
  await writeImage(DATA_JOURNAL_PATH, json(journal), 0o600);
  try { await replay(journal); }
  catch (error) {
    if (plan.rollbackOnError) {
      // A durable decision ensures another process continues the rollback.
      journal.decision = 'rollback';
      journal.checksum = journalChecksum(journal);
      try { await writeImage(DATA_JOURNAL_PATH, json(journal), 0o600); await replay(journal); }
      catch (rollbackError) {
        state.retryAfter.set(context().root, Date.now() + 60_000);
        throw new DataTransactionError('Restore failed and its rollback is pending. Please try again in a minute.', 503, { cause: rollbackError });
      }
    } else state.retryAfter.set(context().root, Date.now() + 60_000);
    throw error;
  }
}

/**
 * How long a writer waits for somebody who genuinely still holds the lock.
 * A lock whose owner is gone is reclaimed at once, so this is never spent
 * waiting on a crash; it only bounds waiting on live work.
 */
const LOCK_WAIT_MS = 30_000;

/**
 * Global AsyncLocalStorage joins nested calls across route bundles. The process
 * queue keeps contenders from this same process off the file lock entirely,
 * so the only contention it ever sees is between processes.
 * The lock is a sibling of the release directory. Copying or deleting a
 * release must never clone or unlink it during a rolling restart.
 */
export async function withDataTransaction<T>(operation: () => Promise<T> | T): Promise<T> {
  const inherited = state.context.getStore();
  if (inherited?.active) return operation();
  const root = getDataRoot();
  const prior = state.queues.get(root) ?? Promise.resolve();
  const run = prior.then(async () => {
    // The lock sits beside the release directory, so a release swap never
    // moves it and both the server and a deploy contend for the same one.
    let held: DataLockHandle;
    try {
      held = await acquireDataLock(`${root}.data.lock`, { waitMs: LOCK_WAIT_MS });
    } catch (error) {
      // Somebody is genuinely working; trying again later is the right advice.
      if (error instanceof DataLockBusyError) throw new DataTransactionError('Another update is already running. Please try again in a moment.', 503, { cause: error });
      // Anything else is a lock that cannot be taken at all, and no amount of
      // trying again will change that.
      throw new DataTransactionError('Home Screens could not get to its saved settings, so nothing was changed.', 500, { cause: error });
    }
    holders.set(root, held);
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      const firstCreated = await fs.mkdir(path.join(root, 'data'), { recursive: true });
      if (firstCreated) await syncDirectory(path.dirname(firstCreated));
      const ctx: Context = { root, active: true };
      outcome = { ok: true, value: await state.context.run(ctx, async () => {
        try { await recover(); return await operation(); }
        finally { ctx.active = false; }
      }) };
    } catch (error) { outcome = { ok: false, error }; }
    // Always released, whatever went wrong above, or the next writer waits on
    // a lock this process is no longer using.
    holders.delete(root);
    await held.release().catch(() => {});
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  });
  const tail = run.then(() => {}, () => {});
  state.queues.set(root, tail);
  try { return await run; } finally { if (state.queues.get(root) === tail) state.queues.delete(root); }
}
