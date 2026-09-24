import { describe, expect, it } from 'vitest';
import { backupFileName } from '../backup-file-name';

// 8 pm on Tuesday 22 September in Chicago, already the 23rd in UTC.
const CHICAGO_EVENING = new Date('2026-09-23T01:00:00Z');

describe('backupFileName', () => {
  it("names the file after the household's day, not the UTC one", () => {
    expect(backupFileName('America/Chicago', {}, CHICAGO_EVENING)).toBe('home-screens-backup-2026-09-22.json');
    expect(backupFileName('Pacific/Auckland', {}, CHICAGO_EVENING)).toBe('home-screens-backup-2026-09-23.json');
  });

  it('marks a file that holds keys', () => {
    expect(backupFileName('America/Chicago', { withKeys: true }, CHICAGO_EVENING))
      .toBe('home-screens-backup-with-keys-2026-09-22.json');
  });
});
