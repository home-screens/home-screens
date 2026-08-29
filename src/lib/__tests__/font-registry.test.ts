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
 * These two entries are the only ones allowed to render in a font the machine
 * happens to have: they exist precisely to say "whatever this platform uses".
 * Every other entry must name a self-hosted family, because the displays run
 * Raspberry Pi OS, which has none of the fonts a Mac or Windows browser has.
 * The "Georgia" entry used to be OS-only and rendered on a kiosk in whatever
 * face fontconfig mapped the generic `serif` alias to.
 */
const PLATFORM_DEFAULT_FONT_IDS = ['system-ui', 'mono'];

describe('self-hosted font coverage', () => {
  const layout = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('every font renders identically on a display that only has the bundled fonts', () => {
    for (const f of FONT_REGISTRY) {
      if (PLATFORM_DEFAULT_FONT_IDS.includes(f.id)) continue;
      expect(f.cssStack, `${f.label} has no self-hosted family`).toMatch(/var\(--font-[a-z-]+\)/);
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
    expect(resolveFontStack('monospace')).toBe('ui-monospace, "SF Mono", Menlo, monospace');
    expect(resolveFontStack('system-ui, sans-serif')).toBe('system-ui, -apple-system, "Segoe UI", sans-serif');
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
