import path from 'node:path';

/**
 * Where the application lives on disk.
 *
 * Kept in its own leaf module, depending on nothing but `node:path`, so the
 * proxy and the auth gate can resolve the same root the data stores do
 * without pulling the transaction coordinator (AsyncLocalStorage, crypto,
 * the journal) in behind it. Two callers resolving one file by two different
 * mechanisms is the bug this exists to prevent.
 */
interface DataRootState { root?: string }
const key = Symbol.for('home-screens.data-root.v1');
const globals = globalThis as typeof globalThis & { [key]?: DataRootState };
const state: DataRootState = globals[key] ??= {};

/** Pin the application pathname at server/CLI startup, before a release swap
 * can move the working-directory inode into the rollback tree. */
export function pinDataRoot(root = process.env.HOME_SCREENS_DIR || process.cwd()): void {
  const resolved = path.resolve(root);
  if (state.root && state.root !== resolved) throw new Error('The application data root is already set.');
  state.root = resolved;
}

/**
 * The pinned root, or the best guess before anything has pinned one. Resolved
 * lazily so tests that override process.cwd() land in their own sandbox.
 * Inside a transaction, prefer data-transaction's getDataRoot, which returns
 * the root that transaction started with.
 */
export function getDataRoot(): string {
  return state.root ?? process.env.HOME_SCREENS_DIR ?? process.cwd();
}
