'use client';

import { Bell, Moon, Sun } from 'lucide-react';
import { useTranslate } from '@/i18n';

interface QuickActionsProps {
  isAsleep: boolean;
  /** The sleep/wake command was sent and the display hasn't confirmed yet. */
  sleepPending: boolean;
  /** No online display to talk to: the button is shown but inert. */
  disabled: boolean;
  onSleepWake: () => void;
  onAlertOpen: () => void;
  /** Name for the waiting label; null in All mode. */
  targetName: string | null;
  /** The one display of a household that never named it. */
  targetUnnamed?: boolean;
}

export default function QuickActions({ isAsleep, sleepPending, disabled, onSleepWake, onAlertOpen, targetName, targetUnnamed = false }: QuickActionsProps) {
  const t = useTranslate('remote');
  const sleepLabel = sleepPending
    ? (targetUnnamed ? t('quickActions.waitingForUnnamed') : targetName ? t('quickActions.waitingFor', { name: targetName }) : t('quickActions.waitingForAll'))
    : isAsleep
      ? t('quickActions.wakeDisplay')
      : t('quickActions.sleepDisplay');
  return (
    <div className="grid grid-cols-2 gap-3 mx-5 mt-5">
      <button
        onClick={onSleepWake}
        disabled={disabled}
        aria-label={isAsleep ? t('quickActions.wakeDisplay') : t('quickActions.sleepDisplay')}
        className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px] flex flex-col items-center gap-2.5 transition-colors active:bg-hs-hover active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 disabled:active:bg-hs-card"
      >
        <div className={`w-11 h-11 rounded-xl bg-violet-500/[0.12] text-violet-400 flex items-center justify-center ${sleepPending ? 'animate-pulse' : ''}`}>
          {isAsleep
            ? <Sun className="w-[22px] h-[22px]" strokeWidth={1.8} aria-hidden="true" />
            : <Moon className="w-[22px] h-[22px]" strokeWidth={1.8} aria-hidden="true" />}
        </div>
        <span className={`text-[13px] font-semibold ${sleepPending ? 'text-hs-text-muted' : 'text-hs-text-primary'}`}>
          {sleepLabel}
        </span>
      </button>

      <button
        onClick={onAlertOpen}
        className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px] flex flex-col items-center gap-2.5 transition-colors active:bg-hs-hover active:scale-[0.97]"
      >
        <div className="w-11 h-11 rounded-xl bg-hs-warning/[0.12] text-hs-warning-ink flex items-center justify-center">
          <Bell className="w-[22px] h-[22px]" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <span className="text-[13px] font-semibold text-hs-text-primary">{t('quickActions.sendAlert')}</span>
      </button>
    </div>
  );
}
