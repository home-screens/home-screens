import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * A JSDoc block attaches to the declaration right under it. When a helper is
 * inserted between a block and the function it described, the block ends up
 * directly above the helper's own block: it documents nothing, editor hover on
 * the function shows no doc, and a top-down reader assigns the contract to the
 * wrong helper. This fails on a doc block whose next non-blank line opens
 * another doc block.
 *
 * A file's overview block is the one exception: a doc block that comes before
 * any code (only imports, directives, comments and blank lines above it) is a
 * header, not a stranded doc, and may be followed by a documented declaration.
 */

const ROOTS = ['src', 'e2e', 'scripts'];
const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs|cjs)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : SOURCE_FILE.test(name) ? [full] : [];
  });
}

const DIRECTIVE = /^['"]use (client|server|strict)['"];?$/;
const IMPORT_END = /from\s+['"][^'"]+['"];?$|^import\s+['"][^'"]+['"];?$|;$/;

/** Line numbers (1-based) of the closing line of each stranded doc block. */
export function findStrandedDocBlocks(source: string): number[] {
  const lines = source.split('\n');
  const found: number[] = [];
  let inDoc = false;
  let docIsHeader = false;
  let inPlainBlock = false;
  let inImport = false;
  let sawCode = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (inPlainBlock) {
      if (t.includes('*/')) inPlainBlock = false;
      continue;
    }
    if (inImport) {
      if (IMPORT_END.test(t)) inImport = false;
      continue;
    }
    if (t.startsWith('/**') && !inDoc) {
      inDoc = true;
      docIsHeader = !sawCode;
    }
    if (inDoc) {
      if (!t.endsWith('*/')) continue;
      inDoc = false;
      let next = i + 1;
      while (next < lines.length && lines[next].trim() === '') next++;
      if (next < lines.length && lines[next].trim().startsWith('/**') && !docIsHeader) found.push(i + 1);
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inPlainBlock = true;
      continue;
    }
    if (t === '' || t.startsWith('//') || DIRECTIVE.test(t)) continue;
    if (t.startsWith('import ') || t.startsWith('import{')) {
      if (!IMPORT_END.test(t)) inImport = true;
      continue;
    }
    sawCode = true;
  }
  return found;
}

describe('stranded doc blocks', () => {
  it('flags a doc block whose next line opens another doc block', () => {
    const source = [
      'const a = 1;',
      '/** Says what foo does. */',
      '/** A helper foo uses. */',
      'function helper() {}',
      'function foo() {}',
    ].join('\n');
    expect(findStrandedDocBlocks(source)).toEqual([2]);
  });

  it('flags a stranded block with blank lines before the next doc block', () => {
    const source = [
      'const a = 1;',
      '/**',
      ' * Says what foo does.',
      ' */',
      '',
      '/** A helper foo uses. */',
      'function helper() {}',
    ].join('\n');
    expect(findStrandedDocBlocks(source)).toEqual([4]);
  });

  it('allows a file header before the first documented declaration', () => {
    const source = [
      "'use client';",
      '',
      "import { a } from './a';",
      'import {',
      '  b,',
      "} from './b';",
      '',
      '/**',
      ' * What this file is for.',
      ' */',
      '',
      '/** The first thing it exports. */',
      'export const first = 1;',
      '',
      '/** The second. */',
      'export const second = 2;',
    ].join('\n');
    expect(findStrandedDocBlocks(source)).toEqual([]);
  });

  it('every doc block in the tree sits on the thing it describes', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        for (const line of findStrandedDocBlocks(readFileSync(file, 'utf8'))) {
          offenders.push(`${path.relative(process.cwd(), file)}:${line}`);
        }
      }
    }
    expect(offenders, `Move each of these doc blocks down to the declaration it describes:\n${offenders.join('\n')}`).toEqual([]);
  });
});
