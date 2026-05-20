'use client';

import Link from 'next/link';
import type { DisplayNode, GlobalSettings, ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import {
  DISPLAY_OVERRIDE_FIELDS,
  SLEEP_OVERRIDE_FIELDS,
  ALERT_OVERRIDE_FIELDS,
} from '@/lib/display-override-fields';
import { orientDimensions } from '@/stores/editor-store';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { useTranslate, type TranslateFn } from '@/i18n';

interface DisplayApiEntry {
  id: string;
  status: { displayState?: string; activeProfile?: string | null } | null;
}

interface OverviewSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
  heartbeat: DisplayApiEntry | null;
}

/**
 * Display detail "Overview" — three at-a-glance KV cards plus a quick
 * summary of which fields the user has currently overridden on this
 * display. The summary uses the same `findDisplaysOverridingFields`
 * helper that powers the Defaults backlink banner; it just queries the
 * union of every override-able field and filters down to this one
 * display, so the display detail page and the defaults pages can never
 * disagree about what counts as an override.
 *
 * Each chip shows both the override and the default — e.g.
 * "Rotation interval: 8s (default: 5s)" — so a glance at this panel
 * tells the user not just *which* fields they overrode, but how far
 * each one drifts from the shared default.
 */
export default function OverviewSubtab({ config, display, heartbeat }: OverviewSubtabProps) {
  const t = useTranslate('editor');
  const dims = display.displayWidth && display.displayHeight
    ? orientDimensions(display.displayWidth, display.displayHeight, display.displayTransform)
    : null;
  const screenCount = display.screens.length;
  // Active profile resolution: the per-display field wins over global,
  // matching `filterConfigForDisplay`'s rule.
  const activeProfileId = display.activeProfile ?? config.settings.activeProfile;
  const profilePool = display.profiles ?? config.profiles ?? [];
  const activeProfile = profilePool.find((p) => p.id === activeProfileId);

  // Compute the union of all override fields and filter to just this
  // display so the "Overrides for Kitchen" panel uses one canonical
  // detection path. Querying ALL fields at once means a future override
  // category (just add it to display-override-fields.ts) shows up here
  // for free.
  const allOverrideFields = [
    ...DISPLAY_OVERRIDE_FIELDS,
    ...SLEEP_OVERRIDE_FIELDS,
    ...ALERT_OVERRIDE_FIELDS,
  ];
  const overrideSummaries = findDisplaysOverridingFields(config, allOverrideFields);
  const myOverrides = overrideSummaries.find((s) => s.displayId === display.id);

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KvCard label={t('common.resolution')}>
          {dims ? (
            <span className="tabular-nums">
              {dims.width} × {dims.height}
            </span>
          ) : (
            <span className="text-hs-text-faint">—</span>
          )}
        </KvCard>
        <KvCard label={t('settings.perDisplayPage.overview.activeProfileLabel')}>
          {activeProfile?.name ?? heartbeat?.status?.activeProfile ?? (
            <span className="text-hs-text-faint">
              {t('settings.perDisplayPage.overview.noActiveProfile')}
            </span>
          )}
        </KvCard>
        <KvCard label={t('settings.perDisplayPage.overview.screensLabel')}>{screenCount}</KvCard>
      </div>

      <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
        <div className="text-xs font-semibold text-hs-text-secondary uppercase tracking-wider mb-3">
          {t('settings.perDisplayPage.overview.overridesHeading', { name: display.name })}
        </div>
        {myOverrides && myOverrides.overriddenFields.length > 0 ? (
          <>
            <div className="text-sm text-hs-text-muted mb-3">
              {t('settings.perDisplayPage.overview.withOverridesPart1', { name: display.name })}
              <Link
                href="?section=defaults&page=display"
                className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
              >
                {t('settings.perDisplayPage.overview.defaultsLink')}
              </Link>
              {t('settings.perDisplayPage.overview.withOverridesPart2')}
            </div>
            <div className="flex gap-2 flex-wrap">
              {myOverrides.overriddenFields.map((field) => (
                <OverrideChip
                  key={String(field)}
                  field={String(field)}
                  display={display}
                  settings={config.settings}
                  t={t}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-sm text-hs-text-faint">
            {t('settings.perDisplayPage.overview.noOverridesPart1', { name: display.name })}
            <Link
              href="?section=defaults&page=display"
              className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
            >
              {t('settings.perDisplayPage.overview.defaultsLink')}
            </Link>
            {t('settings.perDisplayPage.overview.noOverridesPart2')}
          </div>
        )}
      </div>
    </>
  );
}

function KvCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hs-border bg-hs-panel/40 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1.5">{label}</div>
      <div className="text-base text-hs-text-primary font-medium">{children}</div>
    </div>
  );
}

/**
 * One override chip — renders the field's pretty name plus a comparison
 * of the per-display value against the global default. The mockup uses:
 *   "Rotation interval: 8s (default: 5s)"
 * so the user can tell at a glance how far each override drifts from
 * the shared baseline rather than just *that* something was overridden.
 *
 * Whole-block overrides (sleep, screensaver, alerts) don't have a single
 * comparable value — they collapse into a chip that just names the block.
 *
 * `t` is threaded through (rather than re-derived per chip) so every chip
 * in the list shares the same TranslateFn instance — saves a hook call per
 * field and keeps the rendering tree pure.
 */
function OverrideChip({
  field,
  display,
  settings,
  t,
}: {
  field: string;
  display: DisplayNode;
  settings: GlobalSettings;
  t: TranslateFn;
}) {
  const overrides = display.settings ?? {};
  const formatted = formatOverrideComparison(field, overrides, settings, t);

  return (
    <span className="text-[11px] text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/30 px-2.5 py-1 rounded-full">
      {formatted}
    </span>
  );
}

/* ─── Field formatters ─────────────────────────────────────────
 *
 * Each formatter takes the raw stored value (the same shape that lives
 * in `DisplayNodeSettings` / `GlobalSettings`) and returns a short
 * human-readable string. The map is exported through
 * `formatOverrideComparison` rather than as a const so the formatters
 * can be unit-tested as a whole when the test infra grows beyond node.
 */

function formatRotationInterval(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/**
 * Look up a translation, but fall back to the raw value when the key isn't
 * registered — covers plugin-introduced transition effects (and any future
 * additions to the registry) without rendering the dotted-path key.
 */
function tOrFallback(t: TranslateFn, key: string, fallback: string): string {
  const result = t(key);
  return result === key ? fallback : result;
}

// Shortened labels — the chip has no room for the parenthetical clarifiers
// that `TRANSITION_OPTIONS` in @/lib/transitions uses in dropdowns. Looked
// up via t() so de-DE / future locales render properly; falls back to the
// effect's id (e.g. "fade") if a plugin introduces a new value not yet in
// the registry.
function formatTransitionEffect(effect: string, t: TranslateFn): string {
  return tOrFallback(t, `settings.perDisplayPage.overview.transitionLabels.${effect}`, effect);
}

function formatTransitionDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatPauseEnabled(enabled: boolean, t: TranslateFn): string {
  return enabled
    ? t('settings.perDisplayPage.overview.chipValues.pauseOn')
    : t('settings.perDisplayPage.overview.chipValues.pauseOff');
}

function formatPauseTimeout(seconds: number, t: TranslateFn): string {
  return seconds === 0 ? t('settings.perDisplayPage.overview.chipValues.pauseNever') : `${seconds}s`;
}

function formatCursorHide(seconds: number): string {
  return `${seconds}s`;
}

function formatFullscreenTheme(themeId: string): string {
  // Theme names ("Linen", "Charcoal", …) are kept verbatim — product names
  // that don't translate, matching DefaultDisplaySection's policy.
  return FULLSCREEN_THEMES.find((t) => t.id === themeId)?.name ?? themeId;
}

/**
 * Pretty label shown before the colon in each chip — falls back to the raw
 * field key for any future override field that lacks a registered label,
 * mirroring how DefaultDisplaySection handles plugin transitions.
 */
function fieldLabel(field: string, t: TranslateFn): string {
  return tOrFallback(t, `settings.perDisplayPage.overview.fieldLabels.${field}`, field);
}

/**
 * Format one override field as a `Label: <override> (default: <default>)`
 * string. Uses any-typed reads off `overrides`/`settings` because the
 * field key is a `string` here (we get it from
 * `findDisplaysOverridingFields`'s union return), and we don't want to
 * widen the public type just to satisfy the chip rendering. Whole-block
 * overrides (sleep/screensaver/alerts) skip the comparison and return
 * just the label.
 *
 * The default-side read is guarded against `undefined` because almost
 * every override-able field is *optional* on `GlobalSettings` —
 * `transitionEffect`, `transitionDuration`, `pauseEnabled`,
 * `pauseTimeoutSeconds`, `cursorHideSeconds`, and `fullscreenTheme` are
 * all `T | undefined` per the type. Without the guard the chip would
 * render `"Theme: Charcoal (default: undefined)"` for any install whose
 * config never explicitly set a default. Only `rotationIntervalMs` is
 * required and therefore safe to read unguarded. The override side is
 * always present because `findDisplaysOverridingFields` uses an `in`
 * check to decide a field is overridden — if it's in the result set,
 * the key exists on `overrides`.
 */
function formatOverrideComparison(
  field: string,
  overrides: NonNullable<DisplayNode['settings']>,
  settings: GlobalSettings,
  t: TranslateFn,
): string {
  const label = fieldLabel(field, t);

  // Whole-block overrides — no single value to compare against.
  if (field === 'sleep' || field === 'screensaver' || field === 'alerts') {
    return t('settings.perDisplayPage.overview.chipBlockOverridden', { label });
  }

  // Indexed access via `as Record<string, unknown>` — we keep the
  // `field: string` parameter type narrow at the boundary instead of
  // threading a key-of through three layers, since the override
  // discovery helper deliberately returns a flat string set.
  const oRec = overrides as unknown as Record<string, unknown>;
  const sRec = settings as unknown as Record<string, unknown>;
  const overrideValue = oRec[field];
  const defaultValue = sRec[field];

  /**
   * Wrap the comparison string in `Label: <override> (default: <default>)`
   * format, dropping the parenthetical entirely when the default-side
   * value is missing rather than rendering the literal `"undefined"`.
   */
  const compare = (overrideText: string, defaultText: string | null): string =>
    defaultText != null
      ? t('settings.perDisplayPage.overview.chipFieldWithDefault', {
          label,
          value: overrideText,
          defaultValue: defaultText,
        })
      : t('settings.perDisplayPage.overview.chipFieldNoDefault', { label, value: overrideText });

  switch (field) {
    case 'rotationIntervalMs':
      // The only required-on-GlobalSettings field, so the default is
      // safe to read unguarded.
      return compare(
        formatRotationInterval(overrideValue as number),
        formatRotationInterval(defaultValue as number),
      );
    case 'transitionEffect':
      return compare(
        formatTransitionEffect(overrideValue as string, t),
        defaultValue != null ? formatTransitionEffect(defaultValue as string, t) : null,
      );
    case 'transitionDuration':
      return compare(
        formatTransitionDuration(overrideValue as number),
        defaultValue != null ? formatTransitionDuration(defaultValue as number) : null,
      );
    case 'pauseEnabled':
      return compare(
        formatPauseEnabled(overrideValue as boolean, t),
        defaultValue != null ? formatPauseEnabled(defaultValue as boolean, t) : null,
      );
    case 'pauseTimeoutSeconds':
      return compare(
        formatPauseTimeout(overrideValue as number, t),
        defaultValue != null ? formatPauseTimeout(defaultValue as number, t) : null,
      );
    case 'cursorHideSeconds':
      return compare(
        formatCursorHide(overrideValue as number),
        defaultValue != null ? formatCursorHide(defaultValue as number) : null,
      );
    case 'fullscreenTheme':
      return compare(
        formatFullscreenTheme(overrideValue as string),
        defaultValue != null ? formatFullscreenTheme(defaultValue as string) : null,
      );
    default:
      return label;
  }
}
