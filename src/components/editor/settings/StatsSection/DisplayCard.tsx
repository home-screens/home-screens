'use client';

import { Monitor } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { formatAge } from '@/lib/time-format';
import type { DisplayNode } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import { SectionIcon } from './shared/SectionIcon';
import StatusPill from '@/components/ui/StatusPill';
import type { StatusTone } from '@/components/ui/StatusDot';

/** How the pill reads for what a display last said it was doing. */
const DISPLAY_STATE: Record<DisplayStatus['displayState'], { tone: StatusTone; key: string }> = {
  active: { tone: 'success', key: 'settings.statsSection.displayStates.active' },
  dimmed: { tone: 'warning', key: 'settings.statsSection.displayStates.dimmed' },
  asleep: { tone: 'neutral', key: 'settings.statsSection.displayStates.asleep' },
};

interface DisplayCardProps {
  displayStatus: DisplayStatus | null;
  displayConnected: boolean;
  displayState: DisplayStatus['displayState'] | undefined;
  statusAge: number | null;
  isMultiDisplay: boolean;
  displays: DisplayNode[];
  selectedDisplayId: string | null;
  setSelectedDisplay: (id: string | null) => void;
  activeDisplay: DisplayNode | null;
}

export function DisplayCard({
  displayStatus,
  displayConnected,
  displayState,
  statusAge,
  isMultiDisplay,
  displays,
  selectedDisplayId,
  setSelectedDisplay,
  activeDisplay,
}: DisplayCardProps) {
  const t = useTranslate('editor');
  return (
    <div className="md:col-span-2 rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
      {/* flex-wrap so the status pill can drop to its own line instead of
          being overlapped by the display picker at minimum browser width. */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <SectionIcon icon={Monitor} />
          <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">
            {t('settings.statsSection.displayTitle')}
          </span>
          {displayConnected && displayState ? (
            <StatusPill tone={DISPLAY_STATE[displayState].tone} dot={displayState === 'active' ? 'pulse' : true} className="ml-1">
              {t(DISPLAY_STATE[displayState].key)}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral" dot className="ml-1">
              {t('settings.statsSection.offline')}
            </StatusPill>
          )}
        </div>
        {isMultiDisplay && (
          <select
            value={selectedDisplayId ?? ''}
            onChange={(e) => setSelectedDisplay(e.target.value || null)}
            className="rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-[11px] text-hs-text-body hover:bg-hs-hover transition-colors cursor-pointer shrink-0"
            aria-label={t('settings.statsSection.switchDisplay')}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {displayConnected && displayStatus ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-xs">
          <div className="text-hs-text-faint">{t('settings.statsSection.screen')}</div>
          <div className="text-hs-text-body truncate">
            {displayStatus.currentScreen.name}
            <span className="text-hs-text-faint ml-1">
              {t('settings.statsSection.indexOf', { index: displayStatus.currentScreen.index + 1, total: displayStatus.screenCount })}
            </span>
          </div>

          {displayStatus.activeProfile && (
            <>
              <div className="text-hs-text-faint">{t('settings.statsSection.profile')}</div>
              <div className="text-hs-text-secondary">{displayStatus.activeProfile}</div>
            </>
          )}

          {displayStatus.browserStats && (
            <>
              <div className="text-hs-text-faint">{t('settings.statsSection.viewport')}</div>
              <div className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap truncate">
                {displayStatus.browserStats.viewportWidth}×{displayStatus.browserStats.viewportHeight} @ {displayStatus.browserStats.devicePixelRatio}×
              </div>

              <div className="text-hs-text-faint">Chromium</div>
              <div className="text-hs-text-secondary font-mono truncate">
                {displayStatus.browserStats.chromiumVersion ?? t('settings.statsSection.notChromium')}
              </div>
            </>
          )}

          <div className="text-hs-text-faint">{t('settings.statsSection.lastSeen')}</div>
          <div className="text-hs-text-secondary">{t('settings.statsSection.timeAgo', { age: formatAge(statusAge!) })}</div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          {activeDisplay
            ? t('settings.statsSection.noDisplayForNamePrefix', { name: activeDisplay.name })
            : t('settings.statsSection.noDisplayPrefix')}
          {' '}
          <span className="font-mono text-hs-text-muted">
            /display{activeDisplay ? `/${activeDisplay.id}` : ''}
          </span>
          {' '}
          {t('settings.statsSection.noDisplayOpenSuffix')}
        </p>
      )}
    </div>
  );
}
