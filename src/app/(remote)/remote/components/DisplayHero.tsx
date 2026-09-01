'use client';

import type { DisplayStatus } from '@/lib/display-commands';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { useTranslate } from '@/i18n';

interface DisplayHeroProps {
  status: DisplayStatus | null;
  isConnected: boolean;
  lastUpdated: Date | null;
}

const STATE_BADGE = {
  active: 'bg-hs-success/[0.12] text-hs-success border-hs-success/25',
  dimmed: 'bg-hs-warning/[0.12] text-hs-warning border-hs-warning/25',
  asleep: 'bg-hs-text-faint/[0.12] text-hs-text-muted border-hs-text-faint/25',
} as const;

const STATE_KEYS = {
  active: 'displayHero.stateActive',
  dimmed: 'displayHero.stateDimmed',
  asleep: 'displayHero.stateAsleep',
} as const;

export default function DisplayHero({ status, isConnected, lastUpdated }: DisplayHeroProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const displayState = status?.displayState ?? 'active';
  const stateLabel = t(STATE_KEYS[displayState]);

  return (
    <div className="mx-5 mt-1 p-5 bg-hs-card border border-hs-border-strong rounded-[14px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hs-accent/30 to-transparent" />

      <div className="flex items-center justify-between mb-4">
        {status ? (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${STATE_BADGE[displayState]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {stateLabel}
          </span>
        ) : (
          <span />
        )}
        {lastUpdated && (
          <span className="text-xs text-hs-text-faint">{t('displayHero.updatedTimeAgo', { ago: formatTimeAgoLocalized(lastUpdated, tCore) })}</span>
        )}
      </div>

      {status ? (
        <>
          <div className="text-[26px] font-bold tracking-tight text-hs-text-primary mb-1">
            {status.currentScreen.name}
          </div>
          <div className="text-[13px] text-hs-text-faint">
            {t('displayHero.screenIndex', { current: status.currentScreen.index + 1, total: status.screenCount })}
          </div>
        </>
      ) : (
        <div className="text-lg font-semibold text-hs-text-faint">
          {isConnected ? t('displayHero.waiting') : t('displayHero.unreachable')}
        </div>
      )}
    </div>
  );
}
