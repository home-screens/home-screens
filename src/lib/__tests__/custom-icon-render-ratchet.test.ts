import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * An icon field can hold one of the family's own pictures (`custom:<id>`), and
 * a view that prints the field as text shows that token on the wall instead
 * of the picture. Every icon has to go through `<Glyph>`, `<GlyphPrefix>` or
 * `<ChoreIcon>`, which know all the kinds. This fails on a raw `{x.emoji}` or
 * `{step.icon}` text node, or an emoji spliced into a template string.
 */

const ROOTS = ['src/components', 'src/app'];

// A `{` straight after `=` is a prop (`value={meal.emoji}`), which is fine.
const RAW_RENDERS = [
  // {meal.emoji}, {meal?.emoji}, {course.meal?.emoji}
  /(?<!=)\{[\w?.]*\.emoji\}/,
  // {step.icon}, {routine.icon ?? '⏱️'}: the routine and timer icon fields
  /(?<!=)\{(?:step|chip|prev|up|routine|session)\??\.icon(?:\s*(?:\?\?|\|\|)[^}]*)?\}/,
  // `${meal.emoji} ` in a template string
  /\$\{[\w?.]*\.emoji\}/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

describe('icon render ratchet', () => {
  it('draws every icon field through a component that knows custom pictures', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (RAW_RENDERS.some((re) => re.test(line))) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
        });
      }
    }
    expect(offenders, `Render these through <Glyph>, <GlyphPrefix> or <ChoreIcon>:\n${offenders.join('\n')}`).toEqual([]);
  });
});
