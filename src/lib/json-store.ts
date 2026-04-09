import { promises as fs } from 'fs';
import path from 'path';

interface JsonStoreOptions<T> {
  /** File path relative to process.cwd() */
  path: string;
  /** Value returned when the file doesn't exist */
  defaultValue: T;
  /** Copy existing file to .bak before each write */
  backup?: boolean;
  /** Set file permissions after write (e.g., 0o600 for secrets) */
  chmod?: number;
  /**
   * Read error strategy:
   * - 'default': return defaultValue for any error
   * - 'throw-corrupt': return defaultValue for ENOENT, throw on parse/permission errors
   */
  errorHandling?: 'default' | 'throw-corrupt';
}

export function createJsonStore<T>(opts: JsonStoreOptions<T>) {
  let writeQueue: Promise<void> = Promise.resolve();

  // Resolve lazily so tests can override process.cwd() per test case
  function resolvedPath(): string {
    return path.join(process.cwd(), opts.path);
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
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    if (opts.backup) {
      try { await fs.copyFile(filePath, filePath + '.bak'); } catch { /* no existing file */ }
    }
    const tmp = filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    if (opts.chmod != null) await fs.chmod(tmp, opts.chmod);
    await fs.rename(tmp, filePath);
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

  return {
    read,
    write,
    updateAtomic,
    get filePath() { return resolvedPath(); },
  };
}
