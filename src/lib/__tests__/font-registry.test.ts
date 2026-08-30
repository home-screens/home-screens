import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  FONT_REGISTRY,
  FONT_CATEGORY_LABELS,
  EDITORIAL_SERIF_STACK,
  resolveFontStack,
  getFontDefinition,
  fontsByCategory,
} from '../font-registry';

describe('FONT_REGISTRY', () => {
  it('has unique ids', () => {
    const ids = FONT_REGISTRY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a label, cssStack, and category', () => {
    for (const f of FONT_REGISTRY) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.cssStack.length).toBeGreaterThan(0);
      expect(FONT_CATEGORY_LABELS[f.category]).toBeDefined();
    }
  });

  it('has at least one entry per category', () => {
    const grouped = fontsByCategory();
    for (const cat of Object.keys(grouped) as Array<keyof typeof grouped>) {
      expect(grouped[cat].length).toBeGreaterThan(0);
    }
  });
});

/**
 * CSS generic families, which are the ones a display can never be trusted to
 * resolve. `fc-match` on a Home Screens Pi maps `sans-serif`, `serif` and
 * `monospace` to Noto Color Emoji — a font with no Latin glyphs — so text that
 * reaches a bare generic is rendered by whatever Chromium picks per glyph.
 *
 * `system-ui` and `ui-monospace` are deliberately not in this list. They are
 * the whole point of the two platform entries and Chromium maps them to a real
 * platform face rather than through fontconfig's generic aliases; the bundled
 * fallback behind them is what makes them safe either way.
 */
const GENERIC_FAMILIES = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'];

/** The families a generic keyword can stand in for, in stack order. */
function familiesOf(cssStack: string): string[] {
  return cssStack.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
}

describe('self-hosted font coverage', () => {
  const layout = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  /**
   * The invariant, stated as what actually breaks: a generic keyword must
   * never be the family that ends up rendering. Every stack has to name a
   * bundled `var(--font-*)` face before it reaches one.
   *
   * This used to exempt the two "platform default" entries (System UI, System
   * Mono) wholesale, which is how System Mono shipped resolving to a
   * proportional face on a Pi. There is no exemption now: those entries still
   * put the platform families first, they just cannot bottom out on a generic.
   */
  it('no font stack can bottom out on a generic family', () => {
    for (const f of FONT_REGISTRY) {
      const families = familiesOf(f.cssStack);
      const firstGeneric = families.findIndex((fam) => GENERIC_FAMILIES.includes(fam));
      const bundled = families.findIndex((fam) => /^var\(--font-[a-z-]+\)$/.test(fam));
      expect(bundled, `${f.label} names no bundled var(--font-*) family`).toBeGreaterThanOrEqual(0);
      if (firstGeneric >= 0) {
        expect(
          bundled,
          `${f.label} reaches the generic "${families[firstGeneric]}" before any bundled face`,
        ).toBeLessThan(firstGeneric);
      }
    }
  });

  it('every CSS variable in the registry is declared and applied in the root layout', () => {
    // binding name -> CSS variable, e.g. "inter" -> "--font-inter"
    const declared = new Map<string, string>();
    for (const [, binding, body] of layout.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g)) {
      const variable = body.match(/variable: '(--font-[a-z-]+)'/)?.[1];
      if (variable) declared.set(variable, binding);
    }
    // next/font only emits the @font-face when the class is on the tree.
    const applied = layout.slice(layout.indexOf('const FONT_VARIABLES'));

    for (const f of FONT_REGISTRY) {
      for (const [, name] of f.cssStack.matchAll(/var\((--font-[a-z-]+)\)/g)) {
        const binding = declared.get(name);
        expect(binding, `${name} (${f.label}) is not declared in layout.tsx`).toBeDefined();
        expect(applied, `${name} is never applied to the document`).toContain(`${binding}.variable`);
      }
    }
  });

  it('the editorial serif stack falls back to a bundled font', () => {
    expect(EDITORIAL_SERIF_STACK).toMatch(/var\(--font-[a-z-]+\)/);
  });
});

describe('resolveFontStack', () => {
  it('resolves a registry id to its CSS stack', () => {
    expect(resolveFontStack('inter')).toBe('var(--font-inter), system-ui, sans-serif');
    expect(resolveFontStack('playfair')).toContain('Georgia, serif');
  });

  it('upgrades known legacy raw stacks to the registry CSS stack', () => {
    // The original DEFAULT_MODULE_STYLE.fontFamily literal must now resolve to var(--font-inter)
    expect(resolveFontStack('Inter, system-ui, sans-serif')).toBe('var(--font-inter), system-ui, sans-serif');
    expect(resolveFontStack('Georgia, serif')).toBe('Georgia, var(--font-gelasio), serif');
    expect(resolveFontStack('monospace')).toBe('ui-monospace, "SF Mono", Menlo, var(--font-jetbrains), monospace');
    expect(resolveFontStack('system-ui, sans-serif')).toBe('system-ui, -apple-system, "Segoe UI", var(--font-inter), sans-serif');
    // The stacks these two entries carried before they gained a bundled
    // fallback, in case a config stored the literal rather than the id.
    expect(resolveFontStack('ui-monospace, "SF Mono", Menlo, monospace'))
      .toBe('ui-monospace, "SF Mono", Menlo, var(--font-jetbrains), monospace');
    expect(resolveFontStack('system-ui, -apple-system, "Segoe UI", sans-serif'))
      .toBe('system-ui, -apple-system, "Segoe UI", var(--font-inter), sans-serif');
  });

  it('returns unknown raw CSS stacks unchanged', () => {
    expect(resolveFontStack('Comic Sans MS, cursive')).toBe('Comic Sans MS, cursive');
    expect(resolveFontStack('Helvetica Neue')).toBe('Helvetica Neue');
  });

  it('returns undefined for falsy input', () => {
    expect(resolveFontStack(undefined)).toBeUndefined();
    expect(resolveFontStack(null)).toBeUndefined();
    expect(resolveFontStack('')).toBeUndefined();
    expect(resolveFontStack('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(resolveFontStack('  inter  ')).toBe('var(--font-inter), system-ui, sans-serif');
  });
});

describe('getFontDefinition', () => {
  it('returns definition by id', () => {
    const f = getFontDefinition('inter');
    expect(f?.label).toBe('Inter');
  });

  it('returns undefined for unknown id', () => {
    expect(getFontDefinition('does-not-exist')).toBeUndefined();
  });
});

describe('fontsByCategory', () => {
  it('groups fonts and preserves count', () => {
    const grouped = fontsByCategory();
    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(FONT_REGISTRY.length);
  });
});
