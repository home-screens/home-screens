import { getAllModuleDefinitions, getModuleDefinition, styleReachesModule } from '@/lib/module-registry';
import { type ModuleStyle, type ModuleType } from '@/types/config';

/**
 * The style matrix (e2e/display/module-style.spec.ts): for every module the
 * editor offers a Style section to, change one control and prove the module
 * painted differently.
 *
 * Fourteen ratchets police config fields, views, routes, locales, empty states
 * and auto-sizing, and none covered the fields of `ModuleStyle`. That is the
 * hole a font-size control that did nothing lived in for a release, and the
 * hole a Style section that was inert for display-control, and text that
 * stayed white on a light card in sports and standings, were sitting in
 * (plan 50, items 1, 3, 4, 14).
 */

/** One control, and the value that has to produce a visibly different card. */
export interface StyleProbe {
  field: keyof ModuleStyle;
  value: ModuleStyle[keyof ModuleStyle];
}

/**
 * The controls asserted per module. `opacity`, `borderRadius`, `padding`,
 * `backdropBlur`, `shadowSize`, `borderWidth` and `borderColor` are applied
 * by ModuleWrapper alone and cannot be ignored by a module, so they are covered
 * once by the wrapper's own tests rather than 40 times here. (Padding was
 * probed in the first draft and failed on correct modules: content that is
 * centred and does not reach the card's edges moves nothing when the inset
 * grows. Whether it shows is a fact about the fixture, not the module.)
 *
 * These four are the ones a module can defeat: by hardcoding a colour, by
 * sizing its type in px, by naming its own font, or by painting its own
 * background over the card's.
 */
export const STYLE_PROBES: StyleProbe[] = [
  // Dark on the default dark card: the point is that the ink moves, not that
  // it stays readable.
  { field: 'textColor', value: '#101010' },
  { field: 'backgroundColor', value: 'rgba(255, 255, 255, 0.92)' },
  // The one text-size control: a percent of the module's base pixel size.
  // 450% is a 72px floor, which beats the fitted size of every fixture card,
  // so the probe reaches the modules that fit their text as well.
  { field: 'textScale', value: 450 },
  // A registry id (font-registry.ts) for a face that needs no download, so
  // `document.fonts.ready` is not part of the comparison.
  { field: 'fontFamily', value: 'georgia' },
];

/**
 * A reasoned exemption from one probe, per module. A reason here is a claim
 * about how the module is *meant* to behave, not a place to park a failure:
 * "renders no text" is a reason, "was failing" is not.
 */
export type StyleExemptions = Partial<Record<string, Partial<Record<StyleProbe['field'], string>>>>;

const NO_TEXT = 'paints no text, so there is no ink for the text controls to reach';

export const STYLE_EXEMPTIONS: StyleExemptions = {
  image: { textColor: NO_TEXT, textScale: NO_TEXT, fontFamily: NO_TEXT },
  'photo-slideshow': { textColor: NO_TEXT, textScale: NO_TEXT, fontFamily: NO_TEXT },
  iframe: { textColor: NO_TEXT, textScale: NO_TEXT, fontFamily: NO_TEXT },
  shape: {
    textColor: 'paints no text; its fill is its own Color setting',
    textScale: NO_TEXT,
    fontFamily: NO_TEXT,
  },
  icon: {
    // `color: config.color || 'currentColor'` (IconModule.tsx): the glyph
    // follows the text colour only once its own Color setting is cleared, and
    // the registry default sets one.
    textColor: 'its own Color setting wins while set, and the default sets one; cleared, the glyph follows the text colour',
    textScale: 'sized by its own Scale setting in container units (cqmin), not by the type size',
    fontFamily: NO_TEXT,
  },
};

/**
 * The probes that apply to a module: every probe, minus the fields the
 * registry says the module paints from its own settings (`ownsStyleFields`),
 * whose controls the editor hides. A field hidden there and probed here would
 * be a failure with nothing for anyone to fix.
 */
export function probesFor(type: ModuleType): StyleProbe[] {
  const owned = new Set(getModuleDefinition(type)?.ownsStyleFields ?? []);
  return STYLE_PROBES.filter((p) => !owned.has(p.field));
}

/**
 * Every built-in the editor offers a Style section to. Derived from the same
 * predicate PropertyPanel gates the section on, so a module cannot be offered
 * controls the matrix does not check, and a module the panel hides (the
 * fillsCanvas six, the cardless display-control) is exempt by construction
 * rather than by listing.
 */
export function styleMatrixTypes(): ModuleType[] {
  return getAllModuleDefinitions()
    .filter((def) => !def.type.startsWith('plugin:') && styleReachesModule(def))
    .map((def) => def.type);
}
