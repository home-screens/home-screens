/**
 * Public types for the Home Screens i18n runtime.
 *
 * Locale tags are BCP-47 strings (`"en-US"`, `"de-DE"`, `"fr-FR"`, `"pt-BR"`,
 * etc.). We keep the type a string alias rather than a finite union so that
 * adding a new locale only requires updating the `LOCALES` manifest — every
 * call site that handles fallbacks already treats the tag as opaque.
 */
export type Locale = string;

/**
 * A nested dictionary of translation strings.
 *
 * Leaf values are strings. Branches are sub-dictionaries indexed by string
 * keys. The same shape is used for plural-form objects (`one`, `few`, `many`,
 * `other`) — those are recognized at lookup time when `count` is supplied.
 */
export interface Dictionary {
  [key: string]: string | Dictionary;
}

/**
 * The set of namespaces that ship with Home Screens. New namespaces should be
 * added here so the loader and provider can route requests correctly.
 *
 * - `core`     — generic UI strings ("Today", "Loading…")
 * - `modules`  — built-in module strings (Tasks 4–5)
 * - `editor`   — editor surface strings (Task 6)
 * - `remote`   — `/remote` and `/chores` surface strings (Task 6)
 * - `weather`  — provider/condition strings (Task 4)
 *
 * Keep this union and {@link BUILT_IN_NAMESPACES} in sync — a TS-level check
 * in `src/components/__tests__/PluginGlobals.test.tsx` asserts the constant's
 * tuple matches the union exactly so future namespaces force both to update
 * together.
 */
export type Namespace = 'core' | 'modules' | 'editor' | 'remote' | 'weather';

/**
 * Runtime tuple of every built-in namespace. Used by the plugin SDK's
 * `__HS_SDK__.translate` dispatcher to recognise host-shipped namespaces
 * without a hard-coded switch — adding a new entry to {@link Namespace} and
 * here is enough to pick it up in the dispatcher.
 *
 * Declared `as const` so it's both a runtime array and a `readonly` tuple
 * literal; the type test in `PluginGlobals.test.tsx` proves the tuple
 * elements equal the `Namespace` union.
 */
export const BUILT_IN_NAMESPACES = [
  'core',
  'modules',
  'editor',
  'remote',
  'weather',
] as const satisfies readonly Namespace[];

/**
 * Translation function returned by `useTranslate(namespace)` and friends.
 *
 * `key` is a dotted path into the dictionary. `vars` substitutes `{name}`
 * placeholders. When the value resolves to a plural-form object, pass `count`
 * to select the right form via `Intl.PluralRules`.
 */
export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/** Manifest entry describing one registered locale. */
export interface LocaleManifestEntry {
  /** BCP-47 tag (e.g. `"de-DE"`). */
  tag: Locale;
  /** Native-language label shown in pickers (e.g. `"Deutsch"`). */
  nativeName: string;
  /** English label, useful for admin/diagnostic surfaces. */
  englishName: string;
}

/**
 * Map of locale tag → manifest entry. Defined as a Record so consumers can
 * iterate (`Object.values`) or look up by tag (`LOCALES["de-DE"]`).
 */
export type LocaleManifest = Record<Locale, LocaleManifestEntry>;
