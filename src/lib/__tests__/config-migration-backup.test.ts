import { describe, expect, it } from 'vitest';
import { planConfigMigrationBackup } from '../config-migration-backup';

describe('config migration backup plans', () => {
  it('preserves exact config bytes in a private, unique standalone snapshot', () => {
    const raw = '{ "version": 12, "screens": [], "settings": {} }\n';
    const first = planConfigMigrationBackup(raw);
    const second = planConfigMigrationBackup(raw);
    expect(first).toMatchObject({ before: null, after: raw, mode: 0o600 });
    expect(first.path).toMatch(/^data\/backups\/config-v\d+\.\d+\.\d+-(?:[A-Za-z0-9.]+\.)?migration\.12\.[a-f0-9]{32}-\d{8}-\d{6}\.json$/);
    expect(second.path).not.toBe(first.path);
  });

  it('names a config that predates schema numbering as schema zero', () => {
    expect(planConfigMigrationBackup('{"screens":[],"settings":{}}').path).toContain('migration.0.');
  });
});
