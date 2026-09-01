'use client';

import type { DisplayStatus } from '@/lib/display-commands';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { useTranslate } from '@/i18n';

interface DisplayHeroProps {
  status: DisplayStatus | null;
  isConnected: boolean;
  lastUpdated: Date | null;
  /** True when the hub has never received a heartbeat for this display (status 404). */
  neverConnected?: boolean;
}

/** A display whose last hub heartbeat is older than this is shown as Offline. */
const OFFLINE_AFTER_MS = 60_000;

const STATE_BADGE = {
  active: 'bg-hs-success/[0.12] text-hs-success border-hs-success/25',
  dimmed: 'bg-hs-warning/[0.12] text-hs-warning border-hs-warning/25',
  asleep: 'bg-hs-text-faint/[0.12] text-hs-text-muted border-hs-text-faint/25',
  offline: 'bg-hs-text-faint/[0.12] text-hs-text-muted border-hs-text-faint/25',
} as const;

const STATE_KEYS = {
  active: 'displayHero.stateActive',
  dimmed: 'displayHero.stateDimmed',
  asleep: 'displayHero.stateAsleep',
  offline: 'displayHero.stateOffline',
} as const;

export default function DisplayHero({ status, isConnected, lastUpdated, neverConnected = false }: DisplayHeroProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');

  // `status.lastSeen` is the hub-stamped heartbeat time — the honest "is the
  // display alive?" signal. `lastUpdated` is only when this phone last polled
  // the hub, so it must never be presented as display freshness (an unplugged
  // display would read "Updated just now" forever).
  const lastSeen = status?.lastSeen ?? null;
  const isOffline = status !== null && lastSeen !== null && Date.now() - lastSeen > OFFLINE_AFTER_MS;
  const badgeState = isOffline ? 'offline' : (status?.displayState ?? 'active');
  const stateLabel = t(STATE_KEYS[badgeState]);
  const agoSource = lastSeen !== null ? new Date(lastSeen) : lastUpdated;

  return (
    <div className="mx-5 mt-1 p-5 bg-hs-card border border-hs-border-strong rounded-[14px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hs-accent/30 to-transparent" />

      <div className="flex items-center justify-between mb-4">
        {status ? (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${STATE_BADGE[badgeState]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {stateLabel}
          </span>
        ) : (
          <span />
        )}
        {status && agoSource && (
          <span className="text-xs text-hs-text-faint">
            {t(isOffline ? 'displayHero.lastSeenTimeAgo' : 'displayHero.updatedTimeAgo', {
              ago: formatTimeAgoLocalized(agoSource, tCore),
            })}
          </span>
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
      ) : neverConnected ? (
        <>
          <div className="text-lg font-semibold text-hs-text-faint">
            {t('displayHero.notConnectedTitle')}
          </div>
          <div className="mt-1 text-[13px] text-hs-text-faint">
            {t('displayHero.notConnectedHint')}
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
