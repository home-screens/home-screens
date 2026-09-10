import { randomUUID } from 'node:crypto';
import { version } from '../../package.json';
import type { TransactionChange } from './data-transaction';

/** Plan a standalone, immutable copy of the exact pre-migration config.
 * The caller publishes it durably before writing any transformed image. */
export function planConfigMigrationBackup(raw: string): TransactionChange {
  const config = JSON.parse(raw) as { version?: unknown };
  const schema = typeof config.version === 'number' && Number.isSafeInteger(config.version) && config.version >= 0 ? config.version : 0;
  const [base, prerelease] = version.split('+')[0].split(/-(.*)/s);
  const prefix = prerelease ? `${prerelease.replace(/[^A-Za-z0-9.]/g, '.')}.` : '';
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '-');
  const id = randomUUID().replaceAll('-', '');
  return {
    path: `data/backups/config-v${base}-${prefix}migration.${schema}.${id}-${timestamp}.json`,
    before: null,
    after: raw,
    mode: 0o600,
  };
}
