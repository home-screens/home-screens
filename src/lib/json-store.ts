import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { assertStillOwned, durableRemove, durableWriteFile, withDataTransaction, getDataRoot } from './data-transaction';

interface JsonStoreOptions<T> {
  /** File path relative to process.cwd() */
  path: string;
  /** Value returned when the file doesn't exist */
  defaultValue: T;
  /** Copy existing file to .bak before each write */
  backup?: boolean;
  /** Set file permissions after write (e.g., 0o600 for secrets) */
  chmod?: number;
  /** Mode for the containing directory when it has to be created
   *  (e.g., 0o700 so a secrets tree stays unreadable to other users) */
  dirMode?: number;
  /** Runtime-only state that is never part of a journal or backup restore.
   * Uses its per-file queue and atomic rename without global lock/fsync. */
  transient?: boolean;
  /**
   * Read error strategy:
   * - 'default': return defaultValue for any error
   * - 'throw-corrupt': return defaultValue for ENOENT, throw on parse/permission errors
   */
  errorHandling?: 'default' | 'throw-corrupt';
}

/**
 * Delete `data/*.tmp` files left behind by a write that died between
 * creating its temp file and renaming it (a full card, a power cut). Each
 * write cleans up after itself, so anything still here predates this
 * process. Boot-time only: a running write's temp file lives for
 * milliseconds, and this runs before any of them.
 */
export async function sweepStaleTempFiles(dir = 'data'): Promise<void> {
  return withDataTransaction(() => sweepStaleTempFilesLocked(dir));
}

async function sweepStaleTempFilesLocked(dir: string): Promise<void> {
  const root = path.join(getDataRoot(), dir);
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return; // no data dir yet
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.tmp'))
      .map((name) => fs.unlink(path.join(root, name)).catch(() => {})),
  );
}

export function createJsonStore<T>(opts: JsonStoreOptions<T>) {
  let writeQueue: Promise<void> = Promise.resolve();

  // Resolve lazily so tests can override process.cwd() per test case
  function resolvedPath(): string {
    return path.join(getDataRoot(), opts.path);
  }

  async function read(): Promise<T> {
    try {
      const raw = await fs.readFile(resolvedPath(), 'utf-8');
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      if (opts.errorHandling === 'throw-corrupt') {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(opts.defaultValue);
        throw err;
      }
      return structuredClone(opts.defaultValue);
    }
  }

  async function writeImpl(data: T): Promise<void> {
    const filePath = resolvedPath();
    if (opts.backup) {
      // The backup lands under the data root like any other write, so it needs
      // the same permission to be there: without this a writer that lost the
      // lock would overwrite the copy belonging to whoever took it over.
      await assertStillOwned();
      try { await fs.copyFile(filePath, filePath + '.bak'); } catch { /* no existing file */ }
    }
    const contents = JSON.stringify(data, null, 2);
    if (!opts.transient) {
      await durableWriteFile(filePath, contents, opts.chmod, opts.dirMode);
      return;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: opts.dirMode });
    const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, contents, { mode: opts.chmod ?? 0o666, flag: 'wx' });
      await fs.rename(tmp, filePath);
    } catch (error) {
      await fs.unlink(tmp).catch(() => {});
      throw error;
    }
  }

  function write(data: T): Promise<void> {
    const next = writeQueue.then(() => writeImpl(data));
    writeQueue = next.catch(() => {});
    return next;
  }

  /**
   * Atomic read-modify-write. Serializes through the same queue as `write`,
   * so the read happens AFTER any prior queued writes have landed, and
   * subsequent writes wait for this cycle to finish. Use this whenever a
   * caller must observe the on-disk state, mutate it, and persist the
   * result without another writer interleaving.
   *
   * The mutator may throw (including throwing a `Response` for API routes
   * that want to short-circuit) — the throw propagates through the queue
   * without advancing the file, and subsequent queued writes still run.
   *
   * **No-op signal:** if the mutator returns the same reference it was
   * given (`mutated === current`), the disk write is skipped. Use this
   * for routes that conditionally bail (e.g. validation failures) without
   * changing state — it avoids a serialize+fsync on every error and
   * keeps the critical section as short as possible. Mutators that need
   * to persist changes must return a new object (spread / map / etc.).
   *
   * Wrappers that introduce intermediate transformations (migration,
   * normalization, type narrowing) need to detect their own no-op state
   * and explicitly return `current` when nothing forced an upstream
   * change AND the user-supplied mutator returned its input unchanged.
   * See `updateConfigAtomic` (`lib/config.ts`) and `updateMealData`
   * (`lib/meal-data.ts`) for the canonical wrapper pattern.
   */
  function updateAtomic(mutator: (current: T) => T | Promise<T>): Promise<T> {
    // Resolve lazily so the queue propagates errors without skipping.
    let resultHolder: { value: T } | undefined;
    const next = writeQueue.then(async () => {
      // Read happens here, *after* prior queued writes have landed.
      const current = await read();
      const mutated = await mutator(current);
      if (mutated !== current) {
        await writeImpl(mutated);
      }
      resultHolder = { value: mutated };
    });
    writeQueue = next.catch(() => {});
    return next.then(() => {
      if (!resultHolder) {
        // Unreachable: next resolved without setting resultHolder would
        // only happen if writeImpl succeeded but we skipped the assignment.
        throw new Error('updateAtomic: unexpected missing result');
      }
      return resultHolder.value;
    });
  }

  /**
   * Queue deletion of the backing file (e.g. uninstall/cleanup flows).
   * Serialized through the same queue as `write`/`updateAtomic`, so an
   * earlier queued write can't land after the removal and resurrect the
   * file. A missing file is a no-op; other unlink errors propagate.
   */
  function remove(): Promise<void> {
    const next = writeQueue.then(async () => {
      // Through the coordinator, not a bare unlink: removing a file is as much
      // a publication as writing one, and a writer that has lost the lock must
      // not delete what its successor just wrote.
      await durableRemove(resolvedPath());
    });
    writeQueue = next.catch(() => {});
    return next;
  }

  const coordinate = <R>(operation: () => Promise<R>): Promise<R> => opts.transient ? operation() : withDataTransaction(operation);
  return {
    // Acquire the cross-file coordinator BEFORE entering a per-file queue.
    // Nested store calls share its context instead of waiting on themselves.
    read: () => coordinate(read),
    write: (data: T) => coordinate(() => write(data)),
    updateAtomic: (mutator: (current: T) => T | Promise<T>) => coordinate(() => updateAtomic(mutator)),
    remove: () => coordinate(remove),
    get filePath() { return resolvedPath(); },
  };
}
