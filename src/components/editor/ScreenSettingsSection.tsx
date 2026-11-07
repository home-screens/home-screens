'use client';

import { isRotationOff } from '@/lib/resolve-screen-duration';
import { useMemo, useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens } from '@/lib/editor-multi-display';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { SHORT_SCREEN_DURATION_MS } from '@/lib/constants';
import { DEFAULT_GO_BACK_AFTER_MS, openerNames, showsOnlyWhenOpened } from '@/lib/on-demand-screen';
import { describeSchedule } from '@/lib/schedule-summary';
import { resolveModuleLabel } from '@/lib/module-registry';
import { GoBackAfterField } from './GoBackAfterField';
import { PANEL_SECTION_SCREEN_SETTINGS } from './panel-section-reveal';
import { screenHasOpener } from '@/lib/on-demand-screen';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import { ScreenScheduleSection } from './ScreenScheduleSection';
import { ScreenVisibilitySection } from './ScreenVisibilitySection';

/**
 * Shown in the right property panel when a screen is selected but no module
 * is selected: the per-screen rotation duration override, the screen's
 * schedule and its visibility conditions.
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
  const formattingLocale = useFormattingLocale();
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
  // Automatic rotation off (globally or for this display) overrides every
  // screen's own time, so the field would be a lie; a sentence replaces it.
  const displayNode = selectedDisplayId ? config.displays?.find((d) => d.id === selectedDisplayId) : undefined;
  const rotationOff = isRotationOff(config.settings, displayNode);
  const overrideMs = screen.rotationDurationMs;
  const isOverridden = overrideMs !== undefined;
  const isSticky = isOverridden && overrideMs === 0;
  const shortSeconds = SHORT_SCREEN_DURATION_MS / 1000;
  const savedSeconds = Math.round((overrideMs ?? 0) / 1000);
  const draftSeconds = draft !== null ? Number(draft) : savedSeconds;
  const tooShort = Number.isFinite(draftSeconds) && draftSeconds > 0 && draftSeconds < shortSeconds;

  const moduleCount = screen.modules?.length ?? 0;
  const opened = showsOnlyWhenOpened(screen);
  // The modules whose open button opens this screen, named by screen and
  // module, so the choice here says what it changes for them.
  const openers = openerNames(getActiveScreens(config, selectedDisplayId), screen.id, (type) => resolveModuleLabel(type, t), t);
  const openerNamesJoined = openers.join(', ');
  const hasOpener = screenHasOpener(getActiveScreens(config, selectedDisplayId), displayNode?.rules ?? config.rules, screen.id);

  const handleRotationMode = (mode: 'turn' | 'opened') => {
    // The duration override is kept: switching back brings it back.
    updateScreen(screen.id, { rotation: mode === 'opened' ? 'opened' : undefined });
  };

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
    <AccordionSection title={t('screenSettings.sectionTitle')} id={PANEL_SECTION_SCREEN_SETTINGS}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-hs-text-body">{screen.name}</span>
          <span className="text-[11px] text-hs-text-muted bg-hs-card px-1.5 py-0.5 rounded-full">
            {moduleCount === 1
              ? t('screenSettings.moduleCountSingular', { count: moduleCount })
              : t('screenSettings.moduleCountPlural', { count: moduleCount })}
          </span>
        </div>

        {screen.enabled === false && (
          // A switched-off screen's own settings say so first, with the way
          // back on: the only other control is in the tab's menu.
          <div className="flex items-center justify-between gap-2 rounded-md border border-hs-warning/35 bg-hs-warning/10 px-3 py-2" data-testid="screen-switched-off">
            <span className="text-xs text-hs-warning">{t('screenSettings.switchedOff')}</span>
            <button
              type="button"
              onClick={() => updateScreen(screen.id, { enabled: undefined })}
              className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors"
            >
              {t('screenSettings.switchOn')}
            </button>
          </div>
        )}

        <PropertyGroup title={t('fields.rotation')} accent={1}>
          <div role="radiogroup" aria-label={t('fields.rotation')} className="space-y-2 mb-3">
            {(['turn', 'opened'] as const).map((mode) => (
              <label key={mode} htmlFor={`screen-rotation-${mode}`} className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  id={`screen-rotation-${mode}`}
                  type="radio"
                  name="screen-rotation-mode"
                  className="mt-0.5"
                  checked={opened === (mode === 'opened')}
                  onChange={() => handleRotationMode(mode)}
                />
                <span className="block">{t(mode === 'opened' ? 'screenSettings.rotationOpened' : 'screenSettings.rotationTurn')}</span>
              </label>
            ))}
          </div>
          {opened ? (
            <div className="ml-6 space-y-3">
              {opened && (screen.schedule || (screen.visibility?.conditions.length ?? 0) > 0) && (
                <p className="text-[11px] text-hs-text-faint leading-relaxed" data-testid="screen-opened-gated">
                  {screen.schedule
                    ? t('screenSettings.openedOnlyWhen', { when: describeSchedule(screen.schedule, t, formattingLocale, config.settings.timeFormat).short })
                    : t('screenSettings.openedOnlyConditions')}
                </p>
              )}
              <p className={`text-xs ${hasOpener ? 'text-hs-text-dim' : 'text-hs-warning'}`} data-testid="screen-rotation-opened-help">
                {openers.length > 0
                  ? t('screenSettings.rotationOpenedBy', { names: openerNamesJoined })
                  : hasOpener ? t('screenSettings.rotationOpenedHelp') : t('screenSettings.rotationOrphaned')}
              </p>
              <div>
                <label htmlFor="screen-go-back-after" className="block text-xs text-hs-text-muted mb-1.5">
                  {t('screenSettings.goBackAfterLabel')}
                </label>
                <GoBackAfterField
                  id="screen-go-back-after"
                  screen={screen}
                  t={t}
                  onChange={(ms) => updateScreen(screen.id, { goBackAfterMs: ms === DEFAULT_GO_BACK_AFTER_MS ? undefined : ms })}
                />
              </div>
            </div>
          ) : openers.length > 0 ? (
            <p className="ml-6 text-xs text-hs-text-dim mb-3" data-testid="screen-rotation-openers">
              {rotationOff || (isOverridden && overrideMs === 0)
                ? t('screenSettings.openersStay', { names: openerNamesJoined })
                : t('screenSettings.openersTurn', { names: openerNamesJoined, seconds: isOverridden ? savedSeconds : defaultSec })}
            </p>
          ) : null}
          {opened ? null : rotationOff ? (
            <>
              <p className="text-xs text-hs-text-muted" data-testid="screen-rotation-off">
                {t('screenSettings.rotationOffHint')}
              </p>
              {/* An override saved before rotation went off is ignored now,
                  but it is still there and would come back with rotation;
                  the reset stays so it can be cleared without a detour. */}
              {isOverridden && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-accent-hover bg-hs-accent-soft border border-hs-accent/35 hover:bg-hs-accent/20 transition-colors"
                >
                  {t('screenSettings.resetButton')}
                </button>
              )}
            </>
          ) : !isOverridden ? (
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
          own four PropertyGroups (Status / Days / Time window / Behavior), and
          ScreenVisibilitySection does the same with the conditions editor.
          Wrapping them in another PropertyGroup nests groups inside groups —
          the design system isn't built for that, so we render the inner
          groups directly here just like ModuleSection does for ScheduleSection.
          Both editors open with a "Status" group inside a module's accordions;
          stacked here with no accordion between them, each first group is
          named after what it gates instead.
        */}
        <ScreenScheduleSection
          screenId={screen.id}
          schedule={screen.schedule}
          statusTitle={t('propertyPanel.sections.schedule')}
          opened={opened}
        />
        <ScreenVisibilitySection
          screenId={screen.id}
          visibility={screen.visibility}
          statusTitle={t('propertyPanel.sections.conditions')}
          opened={opened}
        />
      </div>
    </AccordionSection>
  );
}
