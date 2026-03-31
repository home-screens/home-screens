'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

interface SystemStats {
  os: { hostname: string; platform: string; arch: string; uptime: number; nodeVersion: string };
  memory: { total: number; free: number; used: number };
  disk: { total: number; used: number; free: number };
  app: { screens: number; modules: number; profiles: number };
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

function UsageBar({ used, total, label, color }: { used: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-[13px] text-neutral-400 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-neutral-500 w-10 text-right tabular-nums shrink-0">{pct}%</span>
    </div>
  );
}

function ConfirmableAction({
  label,
  description,
  confirmLabel,
  onConfirm,
  sheetOpen,
  iconBg,
  iconColor,
  icon,
}: {
  label: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  iconBg: string;
  iconColor: string;
  sheetOpen: boolean;
  icon: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [executed, setExecuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Reset state when the sheet closes
  useEffect(() => {
    if (!sheetOpen) {
      setConfirming(false);
      setExecuted(false);
      clearTimeout(timerRef.current);
    }
  }, [sheetOpen]);

  const handleClick = () => {
    if (executed) return;
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      setExecuted(true);
      onConfirm();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={executed}
      className="flex items-center gap-3.5 py-3.5 w-full text-left transition-opacity active:opacity-70 disabled:opacity-40"
    >
      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[15px] font-medium ${confirming ? 'text-red-400 animate-pulse' : executed ? 'text-neutral-500' : 'text-white'}`}>
          {executed ? 'Sent' : confirming ? confirmLabel : label}
        </div>
        {!confirming && !executed && (
          <div className="text-xs text-neutral-500 mt-0.5">{description}</div>
        )}
      </div>
      {!confirming && !executed && (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-neutral-600 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </button>
  );
}

export default function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/stats');
      if (res.status === 401) { setError('Sign in required'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch stats each time the sheet opens
  useEffect(() => {
    if (open && !loading) fetchStats();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendPower = async (action: 'restart-service' | 'reboot') => {
    try {
      await fetch('/api/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Best-effort — the server may already be restarting
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[101] bg-[#141414] rounded-t-[20px] max-h-[70dvh] overflow-y-auto transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <div className="w-9 h-[5px] rounded-full bg-white/[0.15]" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center text-neutral-400"
            aria-label="Close settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* System Info */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">System</h3>

          {loading ? (
            <p className="text-sm text-neutral-500 text-center py-4">Loading&hellip;</p>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-4">{error}</p>
          ) : stats ? (
            <div className="space-y-0">
              <div className="flex justify-between text-[13px] py-1.5">
                <span className="text-neutral-400">Host</span>
                <span className="text-white font-medium">{stats.os.hostname}</span>
              </div>
              <div className="flex justify-between text-[13px] py-1.5 mb-2">
                <span className="text-neutral-400">Uptime</span>
                <span className="text-white font-medium">{formatUptime(stats.os.uptime)}</span>
              </div>
              <UsageBar used={stats.memory.used} total={stats.memory.total} label="Memory" color="#3b82f6" />
              <UsageBar used={stats.disk.used} total={stats.disk.total} label="Disk" color="#22c55e" />
            </div>
          ) : null}
        </div>

        {/* Power */}
        <div className="px-5 pb-6">
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Power</h3>

          <div className="divide-y divide-white/[0.06]">
            <ConfirmableAction
              label="Restart Service"
              description="Restart the Home Screens app"
              confirmLabel="Tap again to restart"
              onConfirm={() => sendPower('restart-service')}
              sheetOpen={open}
              iconBg="bg-blue-500/[0.12]"
              iconColor="text-blue-400"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              }
            />

            <ConfirmableAction
              label="Reboot Device"
              description="Full system restart"
              confirmLabel="Tap again to reboot"
              onConfirm={() => sendPower('reboot')}
              sheetOpen={open}
              iconBg="bg-red-500/[0.12]"
              iconColor="text-red-400"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
