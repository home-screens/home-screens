'use client';

import { useMemo, useState } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import { SHORT_SCREEN_DURATION_MS } from '@/lib/constants';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import { ScreenScheduleSection } from './ScreenScheduleSection';

/**
 * Shown in the right property panel when a screen is selected but no module
 * is selected. Currently exposes the per-screen rotation duration override.
 *
 * Inherit → Override → numeric (seconds) input → Reset. Similar in spirit to
 * the per-display Settings > OverrideRow pattern, but without a Defaults-page
 * link: this override is per-screen against the global, not per-display
 * against a Defaults page.
 *
 * A duration under SHORT_SCREEN_DURATION_MS is saved as typed; a warning under
 * the field explains that data may not finish loading in time. Zero (sticky)
 * is not a duration and never warns.
 */
export default function ScreenSettingsSection() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, updateScreen } = useEditorStore();
  // What the input shows while it has focus; null shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);

  const screen = useMemo(() => {
    if (!config || !selectedScreenId) return null;
    return getActiveScreens(config, selectedDisplayId).find((s) => s.id === selectedScreenId) ?? null;
  }, [config, selectedDisplayId, selectedScreenId]);

  if (!config || !screen) return null;

  const defaultMs = config.settings.rotationIntervalMs;
  const defaultSec = Math.round(defaultMs / 1000);
  const overrideMs = screen.rotationDurationMs;
  const isOverridden = overrideMs !== undefined;
  const isSticky = isOverridden && overrideMs === 0;
  const shortSeconds = SHORT_SCREEN_DURATION_MS / 1000;
  const savedSeconds = Math.round((overrideMs ?? 0) / 1000);
  const draftSeconds = draft !== null ? Number(draft) : savedSeconds;
  const tooShort = Number.isFinite(draftSeconds) && draftSeconds > 0 && draftSeconds < shortSeconds;

  const moduleCount = screen.modules?.length ?? 0;

  const handleOverride = () => {
    // Seed the override with the current default so the input shows something
    // meaningful right away. User can then edit.
    updateScreen(screen.id, { rotationDurationMs: defaultMs });
  };

  const handleReset = () => {
    updateScreen(screen.id, { rotationDurationMs: undefined });
  };

  const handleChangeSeconds = (secondsText: string) => {
    setDraft(secondsText);
    // Ignore empty input so clearing the field mid-edit doesn't silently
    // flip the screen into sticky mode (Number('') === 0).
    if (secondsText.trim() === '') return;
    const n = Number(secondsText);
    if (!Number.isFinite(n) || n < 0) return;
    const ms = Math.round(n * 1000);
    updateScreen(screen.id, { rotationDurationMs: ms });
  };

  return (
    <AccordionSection title={t('screenSettings.sectionTitle')}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-hs-text-body">{screen.name}</span>
          <span className="text-[11px] text-hs-text-muted bg-hs-card px-1.5 py-0.5 rounded-full">
            {moduleCount === 1
              ? t('screenSettings.moduleCountSingular', { count: moduleCount })
              : t('screenSettings.moduleCountPlural', { count: moduleCount })}
          </span>
        </div>

        <PropertyGroup title={t('fields.rotation')} accent={1}>
          {/* Inheriting: the sentence IS the label, so there is no second copy
              of it to squeeze a button against — both used to wrap. */}
          {!isOverridden ? (
            <>
              <p className="text-xs text-hs-text-muted">
                {t('screenSettings.inheritsHintBefore')}
                <strong className="text-hs-text-secondary">
                  {t('screenSettings.inheritsHintValue', { seconds: defaultSec })}
                </strong>
                {t('screenSettings.inheritsHintAfter')}
              </p>
              <button
                type="button"
                onClick={handleOverride}
                className="mt-2 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-muted bg-hs-card border border-hs-border-strong hover:text-hs-text-body hover:bg-hs-hover transition-colors"
              >
                {t('screenSettings.overrideButton')}
              </button>
            </>
          ) : (
            <div>
              <label htmlFor="screen-rotation-duration" className="block text-xs text-hs-text-muted mb-1.5">
                {t('screenSettings.durationLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="screen-rotation-duration"
                  type="number"
                  min={0}
                  max={86400}
                  step={1}
                  value={draft ?? savedSeconds}
                  onChange={(e) => handleChangeSeconds(e.target.value)}
                  onBlur={() => setDraft(null)}
                  className={`pl-2 pr-1 py-1 text-xs bg-hs-input border rounded text-hs-text-body w-20 ${tooShort ? 'border-hs-warning' : 'border-hs-border-strong'}`}
                />
                <span className="text-xs text-hs-text-muted">{t('screenSettings.secondsUnit')}</span>
                {isSticky && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-hs-warning/15 text-hs-warning border border-hs-warning/35 px-2 py-0.5 rounded-full">
                    {t('screenSettings.stickyBadge')}
                  </span>
                )}
              </div>
              {tooShort && (
                <p className="text-[11px] text-hs-warning mt-2 flex gap-1.5" data-testid="screen-duration-short-warning">
                  <span aria-hidden="true">⚠</span>
                  <span>{t('screenSettings.shortDurationWarning', { seconds: shortSeconds })}</span>
                </p>
              )}
              <p className="text-[11px] text-hs-text-faint mt-2">
                {t('screenSettings.stickyHint')}
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors"
              >
                {t('screenSettings.resetButton')}
              </button>
            </div>
          )}
        </PropertyGroup>

        {/*
          ScreenScheduleSection delegates to ScheduleEditor, which renders its
          own four PropertyGroups (Status / Days / Time window / Behavior).
          Wrapping it in another PropertyGroup nests groups inside groups —
          the design system isn't built for that, so we render the inner
          groups directly here just like ModuleSection does for ScheduleSection.
        */}
        <ScreenScheduleSection screenId={screen.id} schedule={screen.schedule} />
      </div>
    </AccordionSection>
  );
}
