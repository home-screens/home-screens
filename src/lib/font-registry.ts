/**
 * Font registry — central catalog of fonts available to modules.
 *
 * Each entry pairs an ID (stored in config) with the CSS stack used at render
 * time. Stacks reference CSS variables registered in src/app/layout.tsx via
 * next/font/local, pointing at the woff2 files vendored in src/app/fonts —
 * no runtime fetch, and no build-time fetch either.
 *
 * Backward compatible: legacy configs that stored raw CSS stacks still work —
 * resolveFontStack() recognizes well-known legacy stacks (e.g. the original
 * "Inter, system-ui, sans-serif" default) and upgrades them to the registry's
 * var(--font-*) stack so existing data/config.json values benefit from
 * self-hosted fonts without a schema migration.
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';

export interface FontDefinition {
  id: string;
  label: string;
  cssStack: string;
  category: FontCategory;
  /** Weights available without falling back to synthetic-bold rendering. */
  weights: number[];
}

export const FONT_REGISTRY: readonly FontDefinition[] = [
  // -- Sans --
  { id: 'inter',     label: 'Inter',          cssStack: 'var(--font-inter), system-ui, sans-serif',   category: 'sans',   weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { id: 'roboto',    label: 'Roboto',         cssStack: 'var(--font-roboto), system-ui, sans-serif',  category: 'sans',   weights: [400, 500, 700] },
  { id: 'poppins',   label: 'Poppins',        cssStack: 'var(--font-poppins), system-ui, sans-serif', category: 'sans',   weights: [400, 600, 700] },
  { id: 'system-ui', label: 'System UI',      cssStack: 'system-ui, -apple-system, "Segoe UI", sans-serif', category: 'sans', weights: [400, 700] },

  // -- Serif --
  { id: 'playfair',  label: 'Playfair Display', cssStack: 'var(--font-playfair), Georgia, serif',     category: 'serif',  weights: [400, 700, 900] },
  { id: 'lora',      label: 'Lora',           cssStack: 'var(--font-lora), Georgia, serif',           category: 'serif',  weights: [400, 700] },
  { id: 'dm-serif',  label: 'DM Serif Display', cssStack: 'var(--font-dm-serif), Georgia, serif',     category: 'serif',  weights: [400] },
  { id: 'georgia',   label: 'Georgia',        cssStack: 'Georgia, "Times New Roman", serif',          category: 'serif',  weights: [400, 700] },

  // -- Monospace --
  { id: 'jetbrains', label: 'JetBrains Mono', cssStack: 'var(--font-jetbrains), ui-monospace, monospace', category: 'mono', weights: [400, 700] },
  { id: 'mono',      label: 'System Mono',    cssStack: 'ui-monospace, "SF Mono", Menlo, monospace',  category: 'mono',   weights: [400, 700] },

  // -- Display --
  { id: 'bebas',     label: 'Bebas Neue',     cssStack: 'var(--font-bebas), Impact, sans-serif',      category: 'display', weights: [400] },

  // -- Handwriting / script --
  { id: 'caveat',    label: 'Caveat',         cssStack: 'var(--font-caveat), cursive',                category: 'handwriting', weights: [400, 700] },
  { id: 'pacifico',  label: 'Pacifico',       cssStack: 'var(--font-pacifico), cursive',              category: 'handwriting', weights: [400] },
] as const;

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace',
  display: 'Display',
  handwriting: 'Handwriting',
};

/**
 * Map of legacy raw-CSS values previously stored in ModuleStyle.fontFamily,
 * to the registry id that supersedes them. Lets old configs transparently pick
 * up the var(--font-*) stack without a schema bump.
 */
const LEGACY_STACK_TO_ID: Record<string, string> = {
  'Inter, system-ui, sans-serif': 'inter',
  'Georgia, serif': 'georgia',
  'monospace': 'mono',
  'system-ui, sans-serif': 'system-ui',
};

// Precomputed lookup tables (built once at module load).
const REGISTRY_BY_ID = new Map<string, FontDefinition>(FONT_REGISTRY.map((f) => [f.id, f]));
const REGISTRY_BY_CSS_STACK = new Map<string, FontDefinition>(FONT_REGISTRY.map((f) => [f.cssStack, f]));
const FONTS_BY_CATEGORY: Record<FontCategory, FontDefinition[]> = (() => {
  const out: Record<FontCategory, FontDefinition[]> = {
    sans: [], serif: [], mono: [], display: [], handwriting: [],
  };
  for (const f of FONT_REGISTRY) out[f.category].push(f);
  return out;
})();

/**
 * Resolve a stored font value to a CSS font-family stack.
 *
 * Accepts:
 *   - A registry ID (e.g. "playfair")            → returns the registry's CSS stack
 *   - A known legacy CSS stack                   → upgraded to the registry's stack
 *   - Any other raw CSS stack                    → returned unchanged
 *   - undefined / null / empty                   → returns undefined (caller decides default)
 */
export function resolveFontStack(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const direct = REGISTRY_BY_ID.get(trimmed);
  if (direct) return direct.cssStack;
  const legacyId = LEGACY_STACK_TO_ID[trimmed];
  if (legacyId) {
    const upgraded = REGISTRY_BY_ID.get(legacyId);
    if (upgraded) return upgraded.cssStack;
  }
  return trimmed;
}

export function getFontDefinition(id: string): FontDefinition | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function getFontDefinitionByStack(cssStack: string): FontDefinition | undefined {
  return REGISTRY_BY_CSS_STACK.get(cssStack);
}

export function fontsByCategory(): Record<FontCategory, FontDefinition[]> {
  return FONTS_BY_CATEGORY;
}
