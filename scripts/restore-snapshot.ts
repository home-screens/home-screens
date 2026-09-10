/** Offline restore uses the same migration, journal and lock as Settings. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { assertRestoreOwner, assertServiceStopped } from './restore-ownership.mjs';
import type { ScreenConfiguration } from '@/types/config';

const BACKUP_NAME_RE = /^(config-v\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?-\d{8}-\d{6}\.json|last-stable-config\.json)$/;
const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;

async function main() {
  const [name, ...extra] = process.argv.slice(2);
  if (!name || extra.length || !BACKUP_NAME_RE.test(name)) {
    throw new Error('Use: bash scripts/upgrade.sh restore-backup <name from data/backups/>');
  }
  await assertRestoreOwner(process.cwd(), name);
  assertServiceStopped();
  // Direct source/bundle invocation must also refuse an unsafe account, or a
  // running app, before loading anything that can recover or change saved data.
  const { withDataTransaction, commitDataTransaction, getDataRoot, pinDataRoot } = await import('@/lib/data-transaction');
  const { planFamilyRestore } = await import('@/lib/family-import');
  const { validateAllSchedules, validateDisplays } = await import('@/lib/display-filter');
  pinDataRoot(process.cwd());
  await withDataTransaction(async () => {
    const filename = path.join(getDataRoot(), 'data/backups', name);
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) throw new Error('The settings snapshot must be a JSON file no larger than 25 MB.');
    let value: unknown;
    try { value = JSON.parse(await fs.readFile(filename, 'utf8')); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error('The settings snapshot is not valid JSON.');
      throw error;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The settings snapshot must contain a configuration.');
    const config = value as ScreenConfiguration;
    if (!Array.isArray(config.screens) || !config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
      throw new Error('The settings snapshot needs screens and settings.');
    }
    let invalid: string | null;
    try { invalid = validateDisplays(config) || validateAllSchedules(config); }
    catch { throw new Error('The settings snapshot has invalid screens, displays or schedules.'); }
    if (invalid) throw new Error(invalid);
    const planned = await planFamilyRestore({ config });
    await commitDataTransaction({ kind: 'offline-snapshot-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
  });
  process.stdout.write(`${JSON.stringify({ ok: true, restored: name })}\n`);
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'The settings snapshot could not be restored.' })}\n`);
  process.exitCode = 1;
});
