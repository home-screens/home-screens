'use client';

import type { DisplayStatus } from '@/lib/display-commands';

interface StatusBarProps {
  status: DisplayStatus | null;
  isConnected: boolean;
  lastUpdated: Date | null;
}

const STATE_STYLES = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  dimmed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  asleep: 'bg-neutral-700/50 text-neutral-400 border-neutral-600',
} as const;

export default function StatusBar({ status, isConnected, lastUpdated }: StatusBarProps) {
  const displayState = status?.displayState ?? 'active';
  const stateLabel = displayState.charAt(0).toUpperCase() + displayState.slice(1);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Remote Control</h1>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {status && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${STATE_STYLES[displayState]}`}
            >
              {stateLabel}
            </span>
          )}
        </div>
      </div>

      {status ? (
        <p className="text-sm text-neutral-400 mt-0.5">
          {status.currentScreen.name}
          <span className="text-neutral-500">
            {' '}&middot; Screen {status.currentScreen.index + 1}/{status.screenCount}
          </span>
        </p>
      ) : (
        <p className="text-sm text-neutral-500 mt-0.5">
          {isConnected ? 'Waiting for display\u2026' : 'Display unreachable'}
        </p>
      )}

      {lastUpdated && (
        <p className="text-xs text-neutral-600 mt-0.5">
          Updated {formatTimeAgo(lastUpdated)}
        </p>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
