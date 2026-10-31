import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * Every `--cal-*` colour a calendar view paints with is one the module
 * defines. A name nobody defines does not fail anywhere: the browser drops the
 * declaration and the element draws transparent. That is how the week list's
 * meal and chore rows, the family grid's name column and the rolling
 * window's status line went without their background for months.
 */

const ROOT = path.resolve(__dirname, '../../../../..');
const VIEW_DIRS = ['src/components/modules/fullscreen-calendar', 'src/components/modules/shared'];
const DEFINERS = ['src/components/modules/fullscreen-calendar/FullscreenCalendarModule.tsx', 'src/components/modules/shared/DayNoteLine.tsx'];

function sources(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (name === '__tests__') return [];
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sources(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

describe('full-screen calendar colours', () => {
  it('defines every --cal-* variable a view uses without a fallback', () => {
    const defined = new Set(DEFINERS.flatMap((f) => [...readFileSync(path.join(ROOT, f), 'utf8').matchAll(/['"](--cal-[a-z0-9-]+)['"]\s*:/g)].map((m) => m[1])));
    const missing = new Set<string>();
    for (const file of VIEW_DIRS.flatMap(sources)) {
      // `var(--x, fallback)` is safe on its own; only a bare `var(--x)` draws nothing.
      for (const m of readFileSync(path.join(ROOT, file), 'utf8').matchAll(/var\((--cal-[a-z0-9-]+)\)/g)) {
        if (!defined.has(m[1])) missing.add(`${m[1]} (${file})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
