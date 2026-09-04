'use client';

import type { DisplayStatus } from '@/lib/display-commands';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { useTranslate } from '@/i18n';
import type { DisplayLiveEntry } from '../display-target';
import { isOfflineSince } from '@/lib/display-liveness';

interface DisplayHeroProps {
  status: DisplayStatus | null;
  isConnected: boolean;
  lastUpdated: Date | null;
  /** True when the hub has never received a heartbeat for this display (status 404). */
  neverConnected?: boolean;
  /** Registry name of the display being shown; undefined in single-display installs. */
  displayName?: string;
  /**
   * All mode: one compact row per registered display instead of one
   * display's status posing as everyone's. Null in single mode.
   */
  allEntries?: DisplayLiveEntry[] | null;
}

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

type BadgeState = keyof typeof STATE_BADGE;

function StateBadge({ state, label }: { state: BadgeState; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${STATE_BADGE[state]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export default function DisplayHero({ status, isConnected, lastUpdated, neverConnected = false, displayName, allEntries = null }: DisplayHeroProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');

  if (allEntries) {
    return (
      <div className="mx-5 mt-1 p-5 bg-hs-card border border-hs-border-strong rounded-[14px] relative overflow-hidden" data-testid="display-hero-all">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hs-accent/30 to-transparent" />
        <div className="text-[11px] uppercase tracking-wider text-hs-text-faint mb-3">
          {t('displayHero.allHeading')}
        </div>
        <ul className="divide-y divide-hs-border">
          {allEntries.map((entry) => {
            const rowState: BadgeState = entry.offline ? 'offline' : (entry.status?.displayState ?? 'active');
            return (
              <li key={entry.id ?? '__default__'} className="py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-hs-text-primary truncate">{entry.name}</div>
                  <div className="text-[12px] text-hs-text-faint truncate">
                    {entry.status && !entry.neverConnected
                      ? entry.offline
                        ? t('displayHero.lastSeenTimeAgo', {
                            ago: formatTimeAgoLocalized(new Date(entry.lastSeen ?? 0), tCore),
                          })
                        : `${entry.status.currentScreen.name} · ${t('displayHero.screenIndex', {
                            current: entry.status.currentScreen.index + 1,
                            total: entry.status.screenCount,
                          })}`
                      : entry.neverConnected
                        ? t('displayHero.rowNotConnected')
                        : t('displayHero.waiting')}
                  </div>
                </div>
                {entry.status && !entry.neverConnected && (
                  <StateBadge state={rowState} label={t(STATE_KEYS[rowState])} />
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12px] text-hs-text-faint">{t('displayHero.pickOneHint')}</p>
      </div>
    );
  }

  // `status.lastSeen` is the hub-stamped heartbeat time — the honest "is the
  // display alive?" signal. `lastUpdated` is only when this phone last polled
  // the hub, so it must never be presented as display freshness (an unplugged
  // display would read "Updated just now" forever).
  const lastSeen = status?.lastSeen ?? null;
  const isOffline = status !== null && isOfflineSince(lastSeen);
  const badgeState: BadgeState = isOffline ? 'offline' : (status?.displayState ?? 'active');
  const stateLabel = t(STATE_KEYS[badgeState]);
  const agoSource = lastSeen !== null ? new Date(lastSeen) : lastUpdated;

  return (
    <div className="mx-5 mt-1 p-5 bg-hs-card border border-hs-border-strong rounded-[14px] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hs-accent/30 to-transparent" />

      <div className="flex items-center justify-between mb-4">
        {status ? (
          <StateBadge state={badgeState} label={stateLabel} />
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

      {displayName && (
        <div className="text-[11px] uppercase tracking-wider text-hs-text-faint mb-1" data-testid="display-hero-name">
          {displayName}
        </div>
      )}

      {status ? (
        <>
          <div className="text-[26px] font-bold tracking-tight text-hs-text-primary mb-1">
            {status.currentScreen.name}
          </div>
          <div className="text-[13px] text-hs-text-faint">
            {t('displayHero.screenIndex', { current: status.currentScreen.index + 1, total: status.screenCount })}
          </div>
          {isOffline && (
            <div className="mt-2 text-[13px] text-hs-text-faint">{t('displayHero.controlsPaused')}</div>
          )}
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
