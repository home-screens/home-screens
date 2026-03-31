'use client';

import type { DisplayStatus } from '@/lib/display-commands';

interface DisplayHeroProps {
  status: DisplayStatus | null;
  isConnected: boolean;
  lastUpdated: Date | null;
}

const STATE_BADGE = {
  active: 'bg-green-500/[0.12] text-green-400 border-green-500/25',
  dimmed: 'bg-amber-500/[0.12] text-amber-400 border-amber-500/25',
  asleep: 'bg-neutral-500/[0.12] text-neutral-400 border-neutral-500/25',
} as const;

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function DisplayHero({ status, isConnected, lastUpdated }: DisplayHeroProps) {
  const displayState = status?.displayState ?? 'active';
  const stateLabel = displayState.charAt(0).toUpperCase() + displayState.slice(1);

  return (
    <div className="mx-5 mt-1 p-5 bg-white/[0.03] border border-white/[0.06] rounded-[14px] relative overflow-hidden">
      {/* Subtle top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

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
          <span className="text-xs text-neutral-500">Updated {formatTimeAgo(lastUpdated)}</span>
        )}
      </div>

      {status ? (
        <>
          <div className="text-[26px] font-bold tracking-tight text-white mb-1">
            {status.currentScreen.name}
          </div>
          <div className="text-[13px] text-neutral-500">
            Screen <span className="text-neutral-400">{status.currentScreen.index + 1}</span> of{' '}
            <span className="text-neutral-400">{status.screenCount}</span>
          </div>
        </>
      ) : (
        <div className="text-lg font-semibold text-neutral-500">
          {isConnected ? 'Waiting for display\u2026' : 'Display unreachable'}
        </div>
      )}
    </div>
  );
}
