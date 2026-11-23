import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * Every button on the wall draws its pressed look the moment a finger lands:
 * on a Pi the answer can take a quarter of a second, and a button that does
 * nothing in that gap gets tapped twice. So a `<button` under the wall's
 * folders is a `WallButton`, or carries `wallPress` / `wallRowPress` (or their
 * classes) on its opening tag. This fails on one that does neither.
 */

const ROOTS = ['src/components/modules', 'src/components/display'];

/** What marks a button as pressed-looking on its opening tag. */
const PRESSED = /wallPress|wallRowPress|WALL_BUTTON_CLASS|WALL_ROW_CLASS|\bwall-btn\b|\bwall-row\b/;

/** Real exceptions, each with its reason. */
const ALLOWED = new Map<string, string>([
  // The editor and the phone forms pick icons with it; it never draws on the wall.
  ['src/components/modules/chore-chart/IconPicker.tsx', 'not a wall surface'],
  // A hold, not a tap: the red sweep filling the button is its pressed look.
  ['src/components/modules/shared/HoldConfirmButton.tsx', 'its hold sweep is the press'],
  // The one place the press is applied, by spreading `wallPress` into the tag.
  ['src/components/modules/shared/WallButton.tsx', 'is the pressed button'],
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__') return [];
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
  });
}

/** Each `<button ...>` opening tag in a file, with its line, braces balanced so `{() => x > y}` does not end it. */
function buttonTags(source: string): Array<{ line: number; tag: string }> {
  const tags: Array<{ line: number; tag: string }> = [];
  const re = /<button\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push({ line: source.slice(0, match.index).split('\n').length, tag: source.slice(match.index, end + 1) });
  }
  return tags;
}

describe('wall button press ratchet', () => {
  it('reads a tag whose handler holds a ">"', () => {
    const [only] = buttonTags('<button onClick={() => a > b} {...wallPressProps}>x</button>');
    expect(PRESSED.test(only.tag)).toBe(true);
  });

  it('every wall button looks pressed under the finger', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(process.cwd(), root))) {
        const rel = path.relative(process.cwd(), file);
        if (ALLOWED.has(rel)) continue;
        for (const { line, tag } of buttonTags(readFileSync(file, 'utf8'))) {
          if (!PRESSED.test(tag)) offenders.push(`${rel}:${line}`);
        }
      }
    }
    expect(offenders, `Use <WallButton> (or spread wallPress / wallRowPress) for:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('lists only files that still need their exception', () => {
    const stale = [...ALLOWED.keys()].filter((rel) => {
      const source = readFileSync(path.join(process.cwd(), rel), 'utf8');
      return buttonTags(source).every(({ tag }) => PRESSED.test(tag));
    });
    expect(stale).toEqual([]);
  });
});
