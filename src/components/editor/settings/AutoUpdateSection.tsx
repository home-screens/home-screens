'use client';

import { useId } from 'react';
import Toggle from '@/components/ui/Toggle';
import HomeTimeHint from '@/components/editor/HomeTimeHint';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import { formatDateInTZ, formatTimeInTZ, type ClockFormat } from '@/lib/timezone';
import { wallClockMinutes, wallDateKey, type AutoUpdateInfo } from '@/lib/auto-update-policy';
import { lastRunStatus, nextDayWord, pastDayWord } from '@/lib/auto-update-status';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import { SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';

interface Props {
  info: AutoUpdateInfo;
  /** The running version, for "went back to v…". */
  currentVersion: string;
  enabled: boolean;
  /** `HH:MM`, already resolved to the default when unset. */
  time: string;
  saveError: boolean;
  onToggle: (enabled: boolean) => void;
  onSetTime: (time: string) => void;
}

const TIME_RE = /^\d{2}:\d{2}$/;

/** An `HH:MM` wall time, formatted the way the household reads times. */
function formatWallTime(time: string, fmt: ClockFormat): string {
  const [h, m] = time.split(':').map(Number);
  return formatTimeInTZ(new Date(Date.UTC(2000, 0, 1, h, m)), { ...fmt, timezone: 'UTC' });
}

/**
 * Settings > System & updates: install updates by itself at a set time. Only
 * rendered with advanced options on. The last and next run come from the
 * version route; the switch and time are saved with the config.
 */
export default function AutoUpdateSection({ info, currentVersion, enabled, time, saveError, onToggle, onSetTime }: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));
  const timeInputId = useId();
  const fmt: ClockFormat = { timezone, locale, hour12: timeFormat === '12h' };

  const status = lastRunStatus(info.lastRun);
  let lastLine: string | null = null;
  if (info.lastRun && status && !status.standsAlone) {
    const at = new Date(info.lastRun.at);
    const day = pastDayWord(wallDateKey(wallClockMinutes(at, timezone)), info.today);
    const when = t(`settings.systemPage.autoUpdate.when.${day}`, {
      time: formatTimeInTZ(at, fmt),
      date: formatDateInTZ(at, timezone, { month: 'short', day: 'numeric' }, locale),
    });
    lastLine = t(`settings.systemPage.autoUpdate.status.${status.key}`, {
      when,
      tag: info.lastRun.tag ?? '',
      step: info.lastRun.step ?? '',
      version: currentVersion,
    });
  }
  const nextLine = info.nextRun && !status?.standsAlone
    ? t(`settings.systemPage.autoUpdate.next.${nextDayWord(info.nextRun.date, info.today)}`, {
        time: formatWallTime(info.nextRun.time, fmt),
      })
    : null;

  return (
    <section data-field-id="system.autoUpdate">
      <SettingsSectionHeading>
        {t('settings.systemPage.autoUpdate.heading')}
      </SettingsSectionHeading>
      <FieldHint className="mb-3">
        {t('settings.systemPage.autoUpdate.description')}
      </FieldHint>
      <Toggle
        label={t('settings.systemPage.autoUpdate.toggleLabel')}
        checked={enabled}
        onChange={onToggle}
      />
      {enabled && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <label htmlFor={timeInputId} className="block text-xs text-hs-text-muted">
                {t('settings.systemPage.autoUpdate.timeLabel')}
              </label>
              <FieldHint className="mt-0.5">
                {t('settings.systemPage.autoUpdate.timeHelp')}
              </FieldHint>
            </div>
            <input
              id={timeInputId}
              type="time"
              value={time}
              onChange={(e) => {
                if (TIME_RE.test(e.target.value)) onSetTime(e.target.value);
              }}
              data-field-id="system.autoUpdateTime"
              className={`w-32 shrink-0 ${SETTINGS_INPUT_SM_CLASS}`}
            />
          </div>
          <HomeTimeHint />
          {(status || nextLine) && (
            <div className="mt-3.5 space-y-0.5 text-xs" data-testid="system-auto-update-status">
              {status?.standsAlone && (
                <p className="text-hs-text-secondary">
                  {t(`settings.systemPage.autoUpdate.status.${status.key}`)}
                </p>
              )}
              {lastLine && (
                <p>
                  <span className="text-hs-text-faint">{t('settings.systemPage.autoUpdate.lastCheckLabel')}</span>{' '}
                  <span className={status?.warning ? 'text-hs-warning-ink' : 'text-hs-text-secondary'}>{lastLine}</span>
                </p>
              )}
              {nextLine && (
                <p>
                  <span className="text-hs-text-faint">{t('settings.systemPage.autoUpdate.nextCheckLabel')}</span>{' '}
                  <span className="text-hs-text-secondary">{nextLine}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
      {saveError && (
        <p className="text-xs text-hs-danger mt-2" role="alert">
          {tCore('refusals.saveFailed')}
        </p>
      )}
    </section>
  );
}
