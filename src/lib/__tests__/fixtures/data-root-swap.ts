/** Separate processes exercise a real cwd rename and the surviving lock inode. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pinDataRoot, withDataTransaction } from '../../data-transaction';
import { createJsonStore } from '../../json-store';

const base = process.argv[2];
const current = path.join(base, 'current');
const rollback = path.join(base, 'rollback');
process.chdir(current);
pinDataRoot(current);

async function main() {
  const store = createJsonStore({ path: 'data/value.json', defaultValue: { count: 0 } });
  if (process.argv[3] === 'owner') {
    await withDataTransaction(async () => {
      await fs.rename(current, rollback);
      await fs.mkdir(path.join(current, 'data'), { recursive: true });
      // Reentry and store paths must stay on the pinned pathname while cwd
      // still follows the old inode. This used to recurse into its own lock.
      await withDataTransaction(() => store.write({ count: 7 }));
      process.chdir(current);
      await fs.rm(rollback, { recursive: true });
      process.stdout.write('swapped\n');
      await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
    });
    process.stdin.pause();
  } else {
    const result = await withDataTransaction(() => store.read());
    process.stdout.write(`acquired:${result.count}\n`);
  }
}
main().catch((error: unknown) => { process.stderr.write(String(error)); process.exitCode = 1; });
