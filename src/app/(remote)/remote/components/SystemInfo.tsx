'use client';

import { useState, useCallback } from 'react';

interface SystemStats {
  os: { hostname: string; platform: string; arch: string; uptime: number; nodeVersion: string };
  memory: { total: number; free: number; used: number };
  disk: { total: number; used: number; free: number };
  app: { screens: number; modules: number; profiles: number };
}

interface SystemInfoProps {
  needsAuth: boolean;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-400 mb-1">
        <span>{label}</span>
        <span>{formatBytes(used)} / {formatBytes(total)}</span>
      </div>
      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function SystemInfo({ needsAuth }: SystemInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/stats');
      if (res.status === 401) {
        setError('Sign in required');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !stats && !loading) fetchStats();
  };

  return (
    <section>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 w-full text-left"
      >
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          System
        </span>
        <span className={`text-neutral-600 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
          &#x25B6;
        </span>
      </button>

      {expanded && (
        <div className="mt-2 bg-neutral-900 rounded-lg p-3 space-y-3">
          {needsAuth ? (
            <a
              href="/login?from=/remote"
              className="block text-sm text-blue-400 text-center"
            >
              Sign in to view system info
            </a>
          ) : loading ? (
            <p className="text-sm text-neutral-500 text-center">Loading&hellip;</p>
          ) : error ? (
            <p className="text-sm text-red-400 text-center">{error}</p>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-neutral-500">Host</span>
                <span className="text-neutral-300">{stats.os.hostname}</span>
                <span className="text-neutral-500">Uptime</span>
                <span className="text-neutral-300">{formatUptime(stats.os.uptime)}</span>
                <span className="text-neutral-500">Platform</span>
                <span className="text-neutral-300">{stats.os.platform}/{stats.os.arch}</span>
                <span className="text-neutral-500">Screens</span>
                <span className="text-neutral-300">{stats.app.screens}</span>
                <span className="text-neutral-500">Modules</span>
                <span className="text-neutral-300">{stats.app.modules}</span>
              </div>
              <UsageBar used={stats.memory.used} total={stats.memory.total} label="Memory" />
              <UsageBar used={stats.disk.used} total={stats.disk.total} label="Disk" />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
