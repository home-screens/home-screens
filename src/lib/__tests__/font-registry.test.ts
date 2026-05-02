import { describe, it, expect } from 'vitest';
import {
  FONT_REGISTRY,
  FONT_CATEGORY_LABELS,
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

describe('resolveFontStack', () => {
  it('resolves a registry id to its CSS stack', () => {
    expect(resolveFontStack('inter')).toBe('var(--font-inter), system-ui, sans-serif');
    expect(resolveFontStack('playfair')).toContain('Georgia, serif');
  });

  it('upgrades known legacy raw stacks to the registry CSS stack', () => {
    // The original DEFAULT_MODULE_STYLE.fontFamily literal must now resolve to var(--font-inter)
    expect(resolveFontStack('Inter, system-ui, sans-serif')).toBe('var(--font-inter), system-ui, sans-serif');
    expect(resolveFontStack('Georgia, serif')).toBe('Georgia, "Times New Roman", serif');
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
