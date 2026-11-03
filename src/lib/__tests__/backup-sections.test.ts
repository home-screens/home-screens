import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BACKUP_SECTIONS, type BackupSectionKey } from '../backup-sections';
import { MEMBER_REFERENCE_DOMAINS } from '../member-references';

/**
 * Data files the app keeps that a backup deliberately leaves out, each with
 * the reason. A new store under `data/` has to be named here or get a row in
 * `BACKUP_SECTIONS`; this is what makes forgetting a restore impossible.
 */
const NOT_IN_A_BACKUP: Record<string, string> = {
  'data/secrets.json': 'the credentials section, exported and encrypted on its own',
  'data/auth.json': 'the credentials section',
  'data/icloud-accounts.json': 'the credentials section',
  'data/google-tokens.json': 'the credentials section',
  'data/google-picker-tokens.json': 'the credentials section',
  'data/onedrive-tokens.json': 'the credentials section',
  'data/restart-needed.json': 'whether this device is waiting on a restart',
  'data/custom-icons/index.json': 'the customIcons section, which carries pictures and is checked by the icon store',
  'data/timer-session.json': 'the running timer, hot state that is only right on the device it runs on',
  'data/backup-state.json': 'when this device last made a backup',
  'data/auto-update-state.json': 'this device\'s update bookkeeping',
  'data/auto-update-setting.json': 'this device\'s update bookkeeping',
  'data/update-notification-state.json': 'this device\'s update bookkeeping',
  'data/telemetry.json': 'this device\'s anonymous id',
  'data/family-transaction.json': 'the write journal',
  'data/family-migration.json': 'evidence a restore writes, never restored',
  'data/background-cache.json': 'downloaded pictures, fetched again',
  'data/school-holidays.json': 'a cache, fetched again',
  'data/weather-today.json': 'a cache, fetched again',
  'data/plugins/installed.json': 'installed plugins, whose bundles live beside it and are installed again',
};

async function dataFilesNamedInLib(): Promise<Set<string>> {
  const root = path.join(process.cwd(), 'src', 'lib');
  const found = new Set<string>();
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') await walk(full); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const source = await fs.readFile(full, 'utf8');
      for (const match of source.matchAll(/['"`](data\/[A-Za-z0-9_./-]+\.json)['"`]/g)) found.add(match[1]);
    }
  }
  await walk(root);
  return found;
}

describe('backup sections', () => {
  it('has one row for every section of the bundle, each at its own file', () => {
    // The literal makes tsc list every key of BackupContent here, so a section
    // added to the type without a row fails to compile, and the other way
    // round fails below.
    const sections: Record<BackupSectionKey, true> = {
      config: true, family: true, chores: true, choreCompletions: true, meals: true, rewards: true,
      routines: true, todos: true, notes: true, dayNotes: true, timetables: true,
    };
    expect(BACKUP_SECTIONS.map((section) => section.key).sort()).toEqual(Object.keys(sections).sort());
    expect(new Set(BACKUP_SECTIONS.map((section) => section.path)).size).toBe(BACKUP_SECTIONS.length);
  });

  it('covers every data file the app keeps, or the file says why it is left out', async () => {
    const restored = new Set<string>(BACKUP_SECTIONS.map((section) => section.path));
    const unaccounted = [...await dataFilesNamedInLib()].filter((file) => !restored.has(file) && !(file in NOT_IN_A_BACKUP));
    expect(unaccounted, 'give each a BACKUP_SECTIONS row or a reason in NOT_IN_A_BACKUP').toEqual([]);
    const stale = Object.keys(NOT_IN_A_BACKUP).filter((file) => restored.has(file));
    expect(stale, 'listed as left out but has a row').toEqual([]);
  });

  it('restores every file that names a family member', () => {
    const restored = new Set(BACKUP_SECTIONS.map((section) => section.path));
    for (const domain of MEMBER_REFERENCE_DOMAINS) expect(restored, domain.path).toContain(domain.path);
  });

  it('holds each section to a rule and reports it as a plain sentence', () => {
    for (const section of BACKUP_SECTIONS) {
      const error = section.validate('not a document');
      expect(error, section.key).toEqual(expect.any(String));
      expect(error, section.key).toMatch(/ /);
    }
  });
});
