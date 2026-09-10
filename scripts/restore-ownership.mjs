/** Read-only preflight shared by the source CLI, release bundle and launcher. */
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export async function assertRestoreOwner(appRoot, snapshotName = 'NAME-FROM-data/backups') {
  if (!process.getuid || !process.geteuid) {
    throw new Error('Offline restore requires a system that supports account ownership checks.');
  }
  // No mkdir, lock or journal recovery is allowed before this check. The
  // application directory supplies the owner on installs without data yet.
  let owner;
  try {
    const data = await stat(path.join(appRoot, 'data'));
    if (!data.isDirectory()) throw new Error('The Home Screens data path must be a directory.');
    owner = data.uid;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    owner = (await stat(appRoot)).uid;
  }
  if (owner === 0) {
    throw new Error('Offline restore refuses root-owned data. Correct the data directory ownership to the Home Screens service account, then run restore as that account without sudo as root.');
  }
  if (process.getuid() === 0 || process.geteuid() === 0 || process.geteuid() !== owner) {
    const command = `sudo -u ${shellQuote(`#${owner}`)} -- bash ${shellQuote(path.join(appRoot, 'scripts/upgrade.sh'))} restore-backup ${shellQuote(snapshotName)}`;
    throw new Error(`Run restore as the Home Screens account (UID ${owner}), without sudo as root. From another account, use: ${command}`);
  }
}

/**
 * Restoring rewrites several files that the running app also writes, and the
 * two would interleave. The app is a single process and serializes its own
 * writes, so stopping it is the whole of what keeps them apart. The deploy
 * path asks for the same thing, in the same words.
 */
export function assertServiceStopped() {
  const probe = spawnSync('systemctl', ['is-active', '--quiet', 'home-screens'], { stdio: 'ignore' });
  // No systemctl, or it could not be run: nothing to check against, and
  // refusing here would block recovery on every system that does not use it.
  if (probe.error || probe.status === null) return;
  if (probe.status === 0) {
    throw new Error('Home Screens is running. Stop it with "sudo systemctl stop home-screens", restore, then start it again.');
  }
}
