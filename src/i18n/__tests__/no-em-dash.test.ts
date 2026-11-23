import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * No em-dash in anything a family reads: the dictionaries of every locale and
 * the content libraries the wall shows each day (affirmations, words of the
 * day). The product writes a comma, a colon or a full stop instead, and the
 * translations follow the English, so one slipped in here reaches every wall.
 *
 * Content libraries are the folders named `*-content` or `*-words` anywhere
 * under `src/`; a new library named that way is checked without touching this
 * file.
 */

const ROOT = process.cwd();
const EM_DASH = '—';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function contentFolders(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (!statSync(path).isDirectory() || name === 'node_modules') return [];
    return /-(content|words)$/.test(name) ? [path] : contentFolders(path);
  });
}

function emDashLines(files: string[]): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (line.includes(EM_DASH) ? [`${relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 120)}`] : [])),
  );
}

describe('no em-dashes in what a family reads', () => {
  it('finds the content libraries', () => {
    expect(contentFolders(join(ROOT, 'src')).length).toBeGreaterThan(0);
  });

  it('has none in the dictionaries', () => {
    expect(emDashLines(filesUnder(join(ROOT, 'src/translations')))).toEqual([]);
  });

  it('has none in the content libraries', () => {
    expect(emDashLines(contentFolders(join(ROOT, 'src')).flatMap(filesUnder))).toEqual([]);
  });
});
