'use client';

import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { findDisplaysOverridingFields } from '@/lib/display-defaults-backlinks';
import {
  ALERT_OVERRIDE_FIELDS,
  DISPLAY_OVERRIDE_FIELDS,
  SLEEP_OVERRIDE_FIELDS,
} from '@/lib/display-override-fields';
import { useTranslate } from '@/i18n';
import DisplaySubtab from './DisplaySubtab';
import SleepSubtab from './SleepSubtab';
import AlertsSubtab from './AlertsSubtab';

interface OverridesSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Display detail "Overrides" — merged from the former `display`, `sleep`,
 * and `alerts` subtabs, mirroring the merged `Defaults → Screen` page so
 * the defaults page and its override page stay shaped identically:
 *
 *   1. Canvas + per-field OverrideRows      (DisplaySubtab)
 *   2. Sleep whole-block override card      (SleepSubtab)
 *   3. Alerts whole-block override card     (AlertsSubtab)
 *
 * The bulk-actions footer moved up here from DisplaySubtab and now covers
 * the union of all three override groups. The old per-subtab footer
 * deliberately did NOT clear sleep/alerts ("we don't want a button here to
 * silently wipe out overrides on an unrelated page") — that rationale
 * inverted when the three subtabs merged: everything the count reports is
 * now visible on this one page, so "Clear all" clearing all of it is what
 * the label says.
 */
export default function OverridesSubtab({ config, display }: OverridesSubtabProps) {
  const t = useTranslate('editor');
  const { updateDisplaySettings, saveConfig } = useEditorStore();

  const allOverrideFields = [
    ...DISPLAY_OVERRIDE_FIELDS,
    ...SLEEP_OVERRIDE_FIELDS,
    ...ALERT_OVERRIDE_FIELDS,
  ];
  // Reuse `findDisplaysOverridingFields` so the count comes from the same
  // source as the Defaults page banner and the Overview chips.
  const overrideSummary = findDisplaysOverridingFields(config, allOverrideFields).find(
    (s) => s.displayId === display.id,
  );
  const overrideCount = overrideSummary?.overriddenFields.length ?? 0;

  const handleClearAll = async () => {
    const updates: Record<string, undefined> = {};
    for (const field of allOverrideFields) updates[field] = undefined;
    updateDisplaySettings(display.id, updates);
    await saveConfig();
  };

  return (
    <>
      <DisplaySubtab config={config} display={display} />

      <div className="mb-5">
        <SleepSubtab config={config} display={display} />
      </div>

      <AlertsSubtab config={config} display={display} />

      {/* Bulk actions footer — union count across canvas-adjacent fields,
          the sleep block, and the alerts block. */}
      <div className="mt-6 flex items-center justify-between border-t border-hs-border pt-4">
        <div className="text-xs text-hs-text-faint">
          <span className="text-hs-text-secondary">
            {overrideCount === 1
              ? t('settings.perDisplayPage.display.footer.overrideCountSingular', { count: overrideCount })
              : t('settings.perDisplayPage.display.footer.overrideCountPlural', { count: overrideCount })}
          </span>
          {t('settings.perDisplayPage.display.footer.activeForDisplay', { name: display.name })}
        </div>
        {overrideCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-hs-danger hover:text-hs-danger transition-colors"
            title={t('settings.perDisplayPage.display.footer.clearAllTitle')}
          >
            {t('settings.perDisplayPage.display.footer.clearAllButton')}
          </button>
        )}
      </div>
    </>
  );
}
