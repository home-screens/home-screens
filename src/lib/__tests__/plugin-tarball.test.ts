import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { extractPluginTarball } from '../plugins';

let work: string;

beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-tar-'));
});

afterEach(async () => {
  await fs.rm(work, { recursive: true, force: true });
});

/** Pack `pkg/` (as a plugin release wraps its files) and return the tarball. */
async function pack(fill: (pkg: string) => Promise<void>): Promise<string> {
  const pkg = path.join(work, 'src', 'pkg');
  await fs.mkdir(path.join(pkg, 'dist'), { recursive: true });
  await fs.writeFile(path.join(pkg, 'manifest.json'), '{}');
  await fs.writeFile(path.join(pkg, 'dist', 'bundle.js'), '// bundle');
  await fill(pkg);
  const tarball = path.join(work, 'plugin.tar.gz');
  execFileSync('tar', ['-czf', tarball, '-C', path.join(work, 'src'), 'pkg']);
  return tarball;
}

describe('extractPluginTarball', () => {
  it('unpacks a plugin made of ordinary files', async () => {
    const tarball = await pack(async (pkg) => {
      await fs.mkdir(path.join(pkg, 'translations'));
      await fs.writeFile(path.join(pkg, 'translations', 'de-DE.json'), '{}');
    });
    const out = path.join(work, 'out');
    await extractPluginTarball(tarball, out);
    expect(await fs.readFile(path.join(out, 'dist', 'bundle.js'), 'utf-8')).toBe('// bundle');
    expect(await fs.readFile(path.join(out, 'translations', 'de-DE.json'), 'utf-8')).toBe('{}');
  });

  it('refuses a link that points out of the plugin with a relative path', async () => {
    // The name has no `..` in it, so the listing check cannot see this one.
    const tarball = await pack((pkg) => fs.symlink('../../secrets.json', path.join(pkg, 'keys.txt')));
    await expect(extractPluginTarball(tarball, path.join(work, 'out'))).rejects.toThrow(/link or special file/);
  });

  it('refuses a link to an absolute path', async () => {
    const tarball = await pack((pkg) => fs.symlink('/etc/passwd', path.join(pkg, 'dist', 'notes.txt')));
    await expect(extractPluginTarball(tarball, path.join(work, 'out'))).rejects.toThrow(/link or special file/);
  });

  it('refuses a link even when it points at a file inside the plugin', async () => {
    const tarball = await pack((pkg) => fs.symlink('manifest.json', path.join(pkg, 'copy.json')));
    await expect(extractPluginTarball(tarball, path.join(work, 'out'))).rejects.toThrow(/link or special file/);
  });
});
