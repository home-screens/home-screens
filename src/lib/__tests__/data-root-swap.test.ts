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

it('keeps nested access and competing processes on one lock through a release rename and rollback deletion', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-data-root-swap-'));
  await fs.mkdir(path.join(directory, 'current/data'), { recursive: true });
  const owner = start('owner');
  await expect.poll(owner.output).toBe('swapped\n');
  // The rename moved the release out from under the owner. The lock is a
  // sibling, so it stayed put and the owner still holds this exact one.
  const lock = path.join(directory, 'current.data.lock');
  expect((await fs.readFile(lock, 'utf8'))).toContain('token=');
  const contender = start('contender');
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(contender.output()).toBe('');
  owner.child.stdin.write('release\n');
  expect(await owner.done).toMatchObject({ code: 0 });
  expect(await contender.done).toEqual({ code: 0, output: 'acquired:7\n' });
  // Releasing removes it, so the next writer can claim the same pathname.
  await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
}, 10_000);
