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
  // The two "whatever this device uses" entries still name a bundled face
  // before the generic. Raspberry Pi OS resolves `sans-serif`, `serif` and
  // `monospace` to Noto Color Emoji, which carries no Latin glyphs, so a bare
  // generic is never a usable last resort on a display — see the registry test.
  { id: 'system-ui', label: 'System UI',      cssStack: 'system-ui, -apple-system, "Segoe UI", var(--font-inter), sans-serif', category: 'sans', weights: [400, 700] },

  // -- Serif --
  { id: 'playfair',  label: 'Playfair Display', cssStack: 'var(--font-playfair), Georgia, serif',     category: 'serif',  weights: [400, 700, 900] },
  { id: 'lora',      label: 'Lora',           cssStack: 'var(--font-lora), Georgia, serif',           category: 'serif',  weights: [400, 700] },
  { id: 'dm-serif',  label: 'DM Serif Display', cssStack: 'var(--font-dm-serif), Georgia, serif',     category: 'serif',  weights: [400] },
  // Real Georgia first (macOS/Windows browsers have it), then the vendored
  // Gelasio, which is metric-compatible with Georgia. Georgia is a Microsoft
  // core font and is absent from Raspberry Pi OS, so without the self-hosted
  // fallback a kiosk dropped to the generic `serif` alias and rendered this
  // choice in an unrelated face.
  { id: 'georgia',   label: 'Georgia',        cssStack: 'Georgia, var(--font-gelasio), serif',        category: 'serif',  weights: [400, 700] },

  // -- Monospace --
  { id: 'jetbrains', label: 'JetBrains Mono', cssStack: 'var(--font-jetbrains), ui-monospace, monospace', category: 'mono', weights: [400, 700] },
  { id: 'mono',      label: 'System Mono',    cssStack: 'ui-monospace, "SF Mono", Menlo, var(--font-jetbrains), monospace', category: 'mono', weights: [400, 700] },

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
  // The pre-bundled-fallback stacks, kept so a config that stored the literal
  // still resolves to the entry rather than falling through unrecognised.
  'ui-monospace, "SF Mono", Menlo, monospace': 'mono',
  'system-ui, -apple-system, "Segoe UI", sans-serif': 'system-ui',
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

/**
 * Serif stack for views whose design is inherently serif regardless of the
 * module's own font setting (the word and fuzzy clocks). Routed through the
 * registry so such a view can never hardcode a family the display lacks —
 * that is exactly how those two clocks ended up rendering in a fallback face
 * on Raspberry Pi OS, which has no Georgia.
 */
export const EDITORIAL_SERIF_STACK = resolveFontStack('georgia') ?? 'serif';

/**
 * Sans stack for chrome that is not the module's own body text and so never
 * picks up the inherited font: SVG `<text>` (which does not inherit a CSS
 * font-family set on an HTML ancestor the way normal text does) and the few
 * places that build a style object from scratch.
 *
 * Same reasoning as EDITORIAL_SERIF_STACK. The arc clock's numerals were
 * `system-ui, sans-serif`, which rendered in the OS UI face on every platform
 * and, on Raspberry Pi OS, could reach the generic `sans-serif` alias — which
 * fontconfig maps to Noto Color Emoji.
 */
export const UI_SANS_STACK = resolveFontStack('inter') ?? 'sans-serif';

/**
 * Monospace stack for inline code. `ui-monospace, monospace` rendered markdown
 * code spans in Courier on macOS and, on a Pi, resolved through the generic
 * `monospace` alias to Noto Color Emoji.
 */
export const UI_MONO_STACK = resolveFontStack('jetbrains') ?? 'monospace';
