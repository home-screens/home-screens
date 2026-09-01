'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SCREEN_PANEL_IDS } from '@/lib/settings-route';
import { useNavigateToPanel } from '@/components/editor/settings/useNavigateToPanel';
import type { DisplayNodeSettings, ScreenConfiguration } from '@/types/config';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import {
  ALERT_OVERRIDE_FIELDS,
  DISPLAY_OVERRIDE_FIELDS,
  SLEEP_OVERRIDE_FIELDS,
} from '@/lib/display-override-fields';
import DefaultsPageShell from '@/components/editor/settings/DefaultsPageShell';
import CanvasCard from '@/components/editor/settings/screen/CanvasCard';
import AppearanceCard from '@/components/editor/settings/screen/AppearanceCard';
import SleepFormFields, {
  type SleepFormValues,
} from '@/components/editor/settings/display/SleepFormFields';
import AlertFormFields, {
  type AlertFormValues,
} from '@/components/editor/settings/display/AlertFormFields';
import type { DisplayState } from '@/lib/settings-form';
import { useTranslate, type TranslateFn } from '@/i18n';

/**
 * The Screen page's tab set, mirroring AutomationSection's URL-driven
 * `?panel=` pattern so the two tabbed Defaults pages behave identically.
 * Canvas controls (single-display only) live at the top of `appearance`
 * since they're display geometry.
 */
// Sourced from settings-route so the route parser and this tab bar cannot
// disagree about which panel ids exist.
const SCREEN_PANELS = SCREEN_PANEL_IDS;
type ScreenPanel = (typeof SCREEN_PANELS)[number];

function isScreenPanel(value: string | undefined): value is ScreenPanel {
  return !!value && (SCREEN_PANELS as readonly string[]).includes(value);
}

function panelLabel(panel: ScreenPanel, t: TranslateFn): string {
  switch (panel) {
    case 'appearance':
      return t('settings.screenPage.rotationAppearanceHeading');
    case 'sleep':
      return t('settings.screenPage.sleepHeading');
    case 'alerts':
      return t('settings.screenPage.alertsHeading');
  }
}

/**
 * When a sidebar field-search result deep-links here with `?highlight=`,
 * the target field only mounts on its owning tab — so with no explicit
 * `?panel=`, pick the tab from the highlight's field-id prefix instead of
 * always landing on `appearance` (where the highlight would silently
 * time out for sleep/alert fields).
 */
function panelForHighlight(highlight: string | null): ScreenPanel {
  if (highlight?.startsWith('sleep.')) return 'sleep';
  if (highlight?.startsWith('alerts.')) return 'alerts';
  return 'appearance';
}

/** Which card's override fields each tab owns, for the backlink banner. */
const PANEL_OVERRIDE_FIELDS: Record<ScreenPanel, readonly (keyof DisplayNodeSettings)[]> = {
  appearance: DISPLAY_OVERRIDE_FIELDS,
  sleep: SLEEP_OVERRIDE_FIELDS,
  alerts: ALERT_OVERRIDE_FIELDS,
};

interface ScreenSectionProps {
  /** The full config — needed for the backlink banner scan and to decide whether canvas controls render. */
  config: ScreenConfiguration;
  /** Active tab, from the resolved settings route. Undefined means "no tab named". */
  panel?: string;
  displayValues: DisplayState;
  sleepValues: SleepFormValues;
  alertValues: AlertFormValues;
  onDisplayChange: (updates: Partial<DisplayState>) => void;
  onSleepChange: (updates: Partial<SleepFormValues>) => void;
  onAlertsChange: (updates: Partial<AlertFormValues>) => void;
}

/**
 * The "Defaults → Screen" page — the source-of-truth for every shared
 * screen-behavior value: rotation interval, transitions, theme, sleep /
 * dimming, and the alert overlay. Merged from the former Display, Sleep,
 * and Alerts pages: all three were inheritable-defaults pages sharing
 * `DefaultsPageShell`, and Sleep/Alerts were a single form block each,
 * so they render here as cards under one backlink banner.
 *
 * Every per-display override (rendered on the per-display Overrides
 * subtab) links its help text back here, and this page in turn renders a
 * `DefaultsBacklinkBanner` naming which displays currently override the
 * fields of the card on the active tab.
 *
 * Canvas controls (orientation/resolution/flip) only render in
 * single-display installs because that's the only mode where the global
 * `config.settings.displayWidth/Height/Transform` is actually read by a
 * display. In multi-display mode every `DisplayNode` owns its own copy on
 * the node itself (edited from `Per display → <X> → Overrides`) — so the
 * global fields become vestigial and exposing them here would let users
 * edit values nothing reads.
 */
export default function ScreenSection({
  config,
  panel: routePanel,
  displayValues,
  sleepValues,
  alertValues,
  onDisplayChange,
  onSleepChange,
  onAlertsChange,
}: ScreenSectionProps) {
  const t = useTranslate('editor');
  const searchParams = useSearchParams();

  // The active tab comes from the resolved route, not from a second, private
  // read of `?panel=` — two parsers of the same URL would be free to drift.
  // `?highlight=` still selects a tab when the route names none, so a
  // field-search result can jump straight to the tab that renders it.
  const panel: ScreenPanel = isScreenPanel(routePanel)
    ? routePanel
    : panelForHighlight(searchParams?.get('highlight') ?? null);

  const navigateToPanel = useNavigateToPanel('screen');

  // Scan displays for overrides only when `config` or the tab changes.
  // Without the memo this runs on every keystroke into the form (which
  // updates the values/onChange identities), and for a ≤64-display install
  // that's cheap but wasteful — the scan is pure over config. Each tab
  // reports only its own card's fields, so the banner names what is
  // overridden on the tab being looked at and stays quiet elsewhere.
  const overrides = useMemo(
    () => findDisplaysOverridingFields(config, PANEL_OVERRIDE_FIELDS[panel]),
    [config, panel],
  );
  const isMultiDisplay = (config.displays?.length ?? 0) > 0;

  // Lives here, not in CanvasCard: the card only mounts on the appearance
  // tab, so state it owned would reset on every tab switch and the
  // resolution dropdown would snap back from "Custom..." to whichever
  // preset the current dimensions happen to match.
  const [userPickedCustom, setUserPickedCustom] = useState(false);

  return (
    <DefaultsPageShell
      breadcrumb={t('settings.screenPage.breadcrumb')}
      heading={t('settings.screenPage.heading')}
      description={
        <>
          <p className="text-sm text-hs-text-faint mt-1">
            {t('settings.defaultDisplayPage.descriptionPart1')}
            <em>{t('settings.defaultDisplayPage.descriptionEmphasisNot')}</em>
            {t('settings.defaultDisplayPage.descriptionPart2')}
          </p>
          {isMultiDisplay && (
            <p className="text-xs text-hs-text-faint mt-2">
              {t('settings.defaultDisplayPage.multiDisplayNotePart1')}
              <strong className="text-hs-text-secondary">
                {t('settings.defaultDisplayPage.multiDisplayNotePerDisplay')}
              </strong>
              {t('settings.defaultDisplayPage.multiDisplayNotePart2')}
              <em>{t('settings.defaultDisplayPage.multiDisplayNotePerDisplaySection')}</em>
              {t('settings.defaultDisplayPage.multiDisplayNotePart3')}
            </p>
          )}
        </>
      }
      overrides={overrides}
    >

      {/* Tab bar — same visual pattern as AutomationSection and
          PerDisplayPage. The backlink banner above follows the tab: it
          names the overrides of this tab's card and hides otherwise. */}
      <div className="flex items-center border-b border-hs-border mb-5">
        {SCREEN_PANELS.map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`screen-tab-${p}`}
            onClick={() => navigateToPanel(p)}
            className={`px-1 py-2.5 mr-6 text-sm transition-colors border-b-2 ${
              panel === p
                ? 'text-hs-text-primary border-hs-accent'
                : 'text-hs-text-faint border-transparent hover:text-hs-text-secondary'
            }`}
          >
            {panelLabel(p, t)}
          </button>
        ))}
      </div>

      {/* Canvas controls — single-display installs only. In multi-display
          mode the global dims are vestigial (every DisplayNode owns its
          own resolution/rotation), so we hide them rather than letting
          the user edit values nothing reads. */}
      {panel === 'appearance' && !isMultiDisplay && (
        <CanvasCard
          values={displayValues}
          onChange={onDisplayChange}
          userPickedCustom={userPickedCustom}
          onUserPickedCustomChange={setUserPickedCustom}
        />
      )}

      {panel === 'appearance' && (
        <AppearanceCard values={displayValues} onChange={onDisplayChange} />
      )}

      {/* Sleep & dimming — formerly the Defaults → Sleep page. Whole-block
          overridable per display; the banner above reports it on this tab
          via SLEEP_OVERRIDE_FIELDS. */}
      {panel === 'sleep' && (
        <div>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.defaultSleepPage.description')}
          </p>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
            <SleepFormFields values={sleepValues} onChange={onSleepChange} />
          </div>
        </div>
      )}

      {/* Alerts — formerly the Defaults → Alerts page. The `displayId`
          prop is intentionally not passed so the inlined "Clear all
          alerts" affordance stays off the shared defaults page — clearing
          is a per-display operation on the Overrides subtab. */}
      {panel === 'alerts' && (
        <div>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.defaultAlertsPage.description')}
          </p>
          <div className="rounded-lg border border-hs-border bg-hs-panel/40 p-4">
            <AlertFormFields values={alertValues} onChange={onAlertsChange} />
          </div>
        </div>
      )}
    </DefaultsPageShell>
  );
}
