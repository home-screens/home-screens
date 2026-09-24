import { describe, expect, it } from 'vitest';
import { describeConfigBackup } from '../config-backup-label';

const ID = '0123456789abcdef0123456789abcdef';

describe('describeConfigBackup', () => {
  it('reads the version an update snapshot was taken on', () => {
    expect(describeConfigBackup('config-v1.9.0-20260924-130000.json')).toEqual({ kind: 'update', version: '1.9.0' });
    expect(describeConfigBackup('config-v1.12.3-dev.20260908-20260924-130000.json'))
      .toEqual({ kind: 'update', version: '1.12.3-dev.20260908' });
  });

  it('tells a migration original from an update snapshot', () => {
    expect(describeConfigBackup(`config-v1.12.3-migration.12.${ID}-20260924-130000.json`))
      .toEqual({ kind: 'migration', version: '1.12.3' });
    expect(describeConfigBackup(`config-v1.12.3-dev.20260908.migration.12.${ID}-20260924-130000.json`))
      .toEqual({ kind: 'migration', version: '1.12.3-dev.20260908' });
  });

  it('knows the pinned copy from before early versions', () => {
    expect(describeConfigBackup('last-stable-config.json')).toEqual({ kind: 'lastStable' });
  });

  it('has a plain answer for any other name', () => {
    expect(describeConfigBackup('config-backup-2026-07-01.json')).toEqual({ kind: 'other' });
    expect(describeConfigBackup('config-vunknown-20260924-130000.json')).toEqual({ kind: 'other' });
  });
});
