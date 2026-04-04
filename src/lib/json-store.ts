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

  function write(data: T): Promise<void> {
    const next = writeQueue.then(async () => {
      const filePath = resolvedPath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      if (opts.backup) {
        try { await fs.copyFile(filePath, filePath + '.bak'); } catch { /* no existing file */ }
      }
      const tmp = filePath + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
      if (opts.chmod != null) await fs.chmod(tmp, opts.chmod);
      await fs.rename(tmp, filePath);
    });
    writeQueue = next.catch(() => {});
    return next;
  }

  return {
    read,
    write,
    get filePath() { return resolvedPath(); },
  };
}
