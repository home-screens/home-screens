'use client';

import { Monitor } from 'lucide-react';
import { formatAge } from '@/lib/time-format';
import type { DisplayNode } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import { SectionIcon } from './shared/SectionIcon';
import { PulseDot } from './shared/PulseDot';
import type { SemanticColor } from './shared/types';

interface DisplayCardProps {
  displayStatus: DisplayStatus | null;
  displayConnected: boolean;
  displayState: DisplayStatus['displayState'] | undefined;
  stateColor: SemanticColor;
  stateLabel: string;
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
  stateColor,
  stateLabel,
  statusAge,
  isMultiDisplay,
  displays,
  selectedDisplayId,
  setSelectedDisplay,
  activeDisplay,
}: DisplayCardProps) {
  return (
    <div className="md:col-span-2 rounded-xl bg-hs-panel border border-hs-border-strong p-4 min-w-0 overflow-hidden">
      {/* flex-wrap so the status pill can drop to its own line instead of
          being overlapped by the display picker at minimum browser width. */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <SectionIcon icon={Monitor} />
          <span className="text-[10px] uppercase tracking-[0.08em] text-hs-text-faint">
            Display
          </span>
          {displayConnected && displayState ? (
            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ml-1 capitalize whitespace-nowrap ${
              stateColor === 'success'
                ? 'text-hs-success bg-hs-success/15 border-hs-success/30'
                : stateColor === 'warning'
                  ? 'text-hs-warning bg-hs-warning/15 border-hs-warning/30'
                  : 'text-hs-danger bg-hs-danger/15 border-hs-danger/30'
            }`}>
              {displayState === 'active' ? <PulseDot /> : (
                <span className={`w-2 h-2 rounded-full ${stateColor === 'warning' ? 'bg-hs-warning' : 'bg-hs-danger'}`} />
              )}
              {stateLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ml-1 text-hs-text-faint bg-hs-card border-hs-border-strong whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-hs-text-faint" />
              Offline
            </span>
          )}
        </div>
        {isMultiDisplay && (
          <select
            value={selectedDisplayId ?? ''}
            onChange={(e) => setSelectedDisplay(e.target.value || null)}
            className="rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-[11px] text-hs-text-body hover:bg-hs-hover transition-colors cursor-pointer shrink-0"
            aria-label="Switch display"
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {displayConnected && displayStatus ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-xs">
          <div className="text-hs-text-faint">Screen</div>
          <div className="text-hs-text-body truncate">
            {displayStatus.currentScreen.name}
            <span className="text-hs-text-faint ml-1">
              {displayStatus.currentScreen.index + 1} of {displayStatus.screenCount}
            </span>
          </div>

          {displayStatus.activeProfile && (
            <>
              <div className="text-hs-text-faint">Profile</div>
              <div className="text-hs-text-secondary">{displayStatus.activeProfile}</div>
            </>
          )}

          {displayStatus.browserStats && (
            <>
              <div className="text-hs-text-faint">Viewport</div>
              <div className="text-hs-text-secondary font-mono tabular-nums whitespace-nowrap truncate">
                {displayStatus.browserStats.viewportWidth}×{displayStatus.browserStats.viewportHeight} @ {displayStatus.browserStats.devicePixelRatio}×
              </div>

              <div className="text-hs-text-faint">Chromium</div>
              <div className="text-hs-text-secondary font-mono truncate">
                {displayStatus.browserStats.chromiumVersion ?? 'Not Chromium'}
              </div>
            </>
          )}

          <div className="text-hs-text-faint">Last seen</div>
          <div className="text-hs-text-secondary">{formatAge(statusAge!)} ago</div>
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">
          No display connected
          {activeDisplay ? <> for <span className="text-hs-text-secondary">{activeDisplay.name}</span></> : null}
          . Open{' '}
          <span className="font-mono text-hs-text-muted">
            /display{activeDisplay ? `/${activeDisplay.id}` : ''}
          </span>{' '}
          to start.
        </p>
      )}
    </div>
  );
}
