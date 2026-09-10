import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./fixtures/data-root-swap.ts', import.meta.url));
const repo = path.resolve(path.dirname(runner), '../../../..');
const children: ChildProcess[] = [];
let directory: string;
afterEach(async () => {
  for (const child of children) child.kill('SIGKILL');
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function start(action: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', runner, directory, action], { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  let output = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
  const done = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, output }));
  });
  return { child, done, output: () => output };
}

it('keeps nested writes on the pinned pathname through a release rename and rollback deletion', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-data-root-swap-'));
  await fs.mkdir(path.join(directory, 'current/data'), { recursive: true });
  // The release directory is renamed out from under this process mid-write, so
  // its working directory still points at the old inode. Everything inside has
  // to keep using the pathname pinned at startup, or the write lands in the
  // rollback tree and is deleted with it.
  const owner = start('owner');
  expect(await owner.done).toMatchObject({ code: 0 });
  const contender = start('contender');
  expect(await contender.done).toEqual({ code: 0, output: 'acquired:7\n' });
}, 10_000);
