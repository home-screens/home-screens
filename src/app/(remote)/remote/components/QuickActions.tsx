'use client';

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
}

export default function QuickActions({ isAsleep, sleepPending, disabled, onSleepWake, onAlertOpen, targetName }: QuickActionsProps) {
  const t = useTranslate('remote');
  const sleepLabel = sleepPending
    ? (targetName ? t('quickActions.waitingFor', { name: targetName }) : t('quickActions.waitingForAll'))
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
          {isAsleep ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[22px] h-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[22px] h-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </div>
        <span className={`text-[13px] font-semibold ${sleepPending ? 'text-hs-text-muted' : 'text-hs-text-primary'}`}>
          {sleepLabel}
        </span>
      </button>

      <button
        onClick={onAlertOpen}
        className="p-4 bg-hs-card border border-hs-border-strong rounded-[14px] flex flex-col items-center gap-2.5 transition-colors active:bg-hs-hover active:scale-[0.97]"
      >
        <div className="w-11 h-11 rounded-xl bg-amber-500/[0.12] text-amber-400 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[22px] h-[22px]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold text-hs-text-primary">{t('quickActions.sendAlert')}</span>
      </button>
    </div>
  );
}
