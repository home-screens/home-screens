import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * A theme colour class or variable whose name is not defined draws nothing:
 * Tailwind writes no CSS for `text-hs-text-dim`, and `var(--hs-hover)`
 * resolves to the property's initial value, so a hint shows in body colour
 * or a button loses its fill with no error anywhere. This fails on any
 * `*-hs-<name>` colour class or `var(--hs-<name>)` under `src/` whose name
 * `globals.css` does not define. A fallback (`var(--hs-x, #fff)`) does not
 * excuse an undefined name; the fallback would be the only colour it ever had.
 */

/**
 * Variables that are not in `globals.css` because the code sets them inline
 * on the element that reads them. Each needs a reason.
 */
const SET_AT_RUNTIME: Record<string, string> = {
  // Each confetti piece sets its own tilt inline; the fall keyframes in
  // globals.css read it so the piece keeps its angle while it drops.
  '--hs-confetti-rotate': 'set per confetti piece in DayCompleteSheet, DayCompleteOverlay and TimerCelebration',
};

const COLOR_UTILITY =
  /(?<![\w-])(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|accent|fill|stroke|outline|divide|from|to|via|shadow|placeholder|caret|decoration)-hs-([a-z0-9-]+)/g;
const VAR_USE = /var\(\s*(--(?:color-)?hs-[a-zA-Z0-9-]+)\s*[,)]/g;
const DECLARATION = /(--[a-zA-Z0-9-]+)\s*:/g;

/** Every custom property `globals.css` declares, in any theme block or `@theme`. */
export function declaredProperties(css: string): Set<string> {
  return new Set([...css.matchAll(DECLARATION)].map((m) => m[1]));
}

/** Names used in one file that nothing defines, as `line: token`. */
export function undefinedTokens(source: string, declared: Set<string>, runtime: Set<string> = new Set()): string[] {
  const found: string[] = [];
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(COLOR_UTILITY)) {
      // `bg-hs-warning/10`: the match already stops at the opacity suffix.
      const name = m[1];
      if (!declared.has(`--color-hs-${name}`) && !declared.has(`--shadow-hs-${name}`)) found.push(`${i + 1}: ${m[0]}`);
    }
    for (const m of line.matchAll(VAR_USE)) {
      const name = m[1];
      if (!declared.has(name) && !runtime.has(name)) found.push(`${i + 1}: var(${name})`);
    }
  });
  return found;
}

const SOURCE_FILE = /\.(ts|tsx|css)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === '__tests__' || name === 'node_modules') return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : SOURCE_FILE.test(name) ? [full] : [];
  });
}

describe('theme token names', () => {
  const css = ':root { --hs-text-faint: #777; --hs-bg-hover: #333; }\n@theme inline { --color-hs-text-faint: var(--hs-text-faint); --color-hs-warning: var(--hs-warning); }';
  const declared = declaredProperties(css);

  it('accepts defined classes, with variants and opacity suffixes', () => {
    expect(undefinedTokens('className="hover:text-hs-text-faint bg-hs-warning/10 border-l-hs-warning"', declared)).toEqual([]);
  });

  it('flags a class whose colour does not exist', () => {
    expect(undefinedTokens('className="text-hs-text-dim"', declared)).toEqual(['1: text-hs-text-dim']);
  });

  it('flags an undefined variable even with a fallback', () => {
    expect(undefinedTokens("background: 'var(--hs-hover)'", declared)).toEqual(['1: var(--hs-hover)']);
    expect(undefinedTokens("color: 'var(--hs-nope, #fff)'", declared)).toEqual(['1: var(--hs-nope)']);
    expect(undefinedTokens("background: 'var(--hs-bg-hover, #333)'", declared)).toEqual([]);
  });

  it('accepts a variable the code sets at runtime only when it is listed', () => {
    const line = 'rotate(var(--hs-spin, 0deg))';
    expect(undefinedTokens(line, declared)).toEqual(['1: var(--hs-spin)']);
    expect(undefinedTokens(line, declared, new Set(['--hs-spin']))).toEqual([]);
  });

  it('every theme colour class and variable under src/ is defined in globals.css', () => {
    const root = process.cwd();
    const globals = declaredProperties(readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'));
    const runtime = new Set(Object.keys(SET_AT_RUNTIME));
    const offenders = walk(path.join(root, 'src')).flatMap((file) =>
      undefinedTokens(readFileSync(file, 'utf8'), globals, runtime).map((hit) => `${path.relative(root, file)}:${hit}`),
    );
    expect(offenders, `Define these in src/app/globals.css or use an existing token:\n${offenders.join('\n')}`).toEqual([]);
  });
});
