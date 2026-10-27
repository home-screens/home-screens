import type { ModuleStyle } from '@/types/config';

/**
 * The card-level style each material replaces: the wrapper's background is
 * cleared (the view paints the surface edge to edge), the ink and face are
 * the material's. Font ids are registry ids (`src/lib/font-registry.ts`),
 * all bundled, so a Pi draws the same face as the Mac.
 */
export const MATERIAL_SURFACE: Record<
  'chalkboard' | 'letterboard' | 'whiteboard' | 'fridge' | 'notebook' | 'receipt' | 'neon' | 'headline',
  Pick<ModuleStyle, 'backgroundColor' | 'textColor' | 'fontFamily'>
> = {
  chalkboard: { backgroundColor: 'transparent', textColor: '#f1ede2', fontFamily: 'caveat' },
  letterboard: { backgroundColor: 'transparent', textColor: '#f4f1ea', fontFamily: 'bebas' },
  whiteboard: { backgroundColor: 'transparent', textColor: '#1f2937', fontFamily: 'caveat' },
  fridge: { backgroundColor: 'transparent', textColor: '#222222', fontFamily: 'caveat' },
  notebook: { backgroundColor: 'transparent', textColor: '#1e3a8a', fontFamily: 'caveat' },
  receipt: { backgroundColor: 'transparent', textColor: '#1a1a1a', fontFamily: 'jetbrains' },
  neon: { backgroundColor: 'transparent', textColor: '#ffffff', fontFamily: 'pacifico' },
  headline: { backgroundColor: 'transparent', textColor: '#1b1a17', fontFamily: 'lora' },
};
