import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * No font stack anywhere in the app may bottom out on a CSS generic.
 *
 * `font-registry.test.ts` enforces this for the registry. This does the same
 * for every stack written by hand in a component, because that is where the
 * real ones hid: the arc clock's SVG numerals were `system-ui, sans-serif`
 * and markdown code spans were `ui-monospace, monospace`. Both rendered in an
 * OS face on a Mac, and on Raspberry Pi OS a bare generic resolves to Noto
 * Color Emoji — a font with no Latin glyphs.
 *
 * Use the shared constants (`UI_SANS_STACK`, `UI_MONO_STACK`,
 * `EDITORIAL_SERIF_STACK`) or a `var(--font-*)` family rather than adding an
 * entry here.
 */

const SRC = path.join(process.cwd(), 'src');
const GENERICS = /\b(sans-serif|serif|monospace|cursive|fantasy)\b/;

/**
 * Stacks that legitimately name only platform families, with the reason.
 * Keys are repo-relative paths.
 */
const ALLOWED: Record<string, string> = {
  // A standalone HTML page returned by the OAuth callback, rendered in the
  // visitor's own browser with none of the app's CSS or bundled fonts loaded.
  // There is no var(--font-*) to reach for, so the platform stack is correct.
  'app/api/plugins/auth/callback/route.ts': 'standalone HTML response, no app stylesheet',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('hand-written font stacks', () => {
  it('always name a bundled family before any generic', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file);
      if (ALLOWED[rel]) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');

      lines.forEach((line, i) => {
        // Only declarations, so prose in a comment mentioning "sans-serif"
        // does not trip this.
        if (!/font-family|fontFamily/.test(line)) return;
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        if (!GENERICS.test(line)) return;
        // A bundled face, a shared constant, or a value computed elsewhere.
        if (/var\(--font-|_STACK|resolveFontStack/.test(line)) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(offenders, `font stacks that can fall through to a generic:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
