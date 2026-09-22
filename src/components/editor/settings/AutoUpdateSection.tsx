'use client';

import { useId } from 'react';
import Toggle from '@/components/ui/Toggle';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { resolveTimeFormat } from '@/lib/clock-time';
import { formatDateInTZ, formatTimeInTZ, type ClockFormat } from '@/lib/timezone';
import { wallClockMinutes, wallDateKey, type AutoUpdateInfo } from '@/lib/auto-update-policy';
import { lastRunStatus, nextDayWord, pastDayWord } from '@/lib/auto-update-status';

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
  const locale = useFormattingLocale();
  const timezone = useEditorStore((s) => s.config?.settings?.timezone);
  const timeFormat = useEditorStore((s) => s.config?.settings?.timeFormat);
  const timeInputId = useId();
  const fmt: ClockFormat = { timezone, locale, hour12: resolveTimeFormat(undefined, timeFormat) === '12h' };

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
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.systemPage.autoUpdate.heading')}
      </h3>
      <p className="text-xs text-hs-text-faint mb-3">
        {t('settings.systemPage.autoUpdate.description')}
      </p>
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
              <p className="text-xs text-hs-text-faint mt-0.5">
                {t('settings.systemPage.autoUpdate.timeHelp')}
              </p>
            </div>
            <input
              id={timeInputId}
              type="time"
              value={time}
              onChange={(e) => {
                if (TIME_RE.test(e.target.value)) onSetTime(e.target.value);
              }}
              data-field-id="system.autoUpdateTime"
              className="w-32 shrink-0 rounded-md bg-hs-card border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
            />
          </div>
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
                  <span className={status?.warning ? 'text-hs-warning' : 'text-hs-text-secondary'}>{lastLine}</span>
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
          {t('common.saveFailed')}
        </p>
      )}
    </section>
  );
}
