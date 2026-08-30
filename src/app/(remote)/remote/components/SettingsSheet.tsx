'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme';
import { formatUptime } from '@/lib/time-format';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import type { SystemStats } from '@/lib/system-stats-types';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onBackup: () => Promise<boolean>;
  backupBusy: boolean;
}

function UsageBar({ used, total, label, color }: { used: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-[13px] text-hs-text-muted w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-hs-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-hs-text-faint w-10 text-right tabular-nums shrink-0">{pct}%</span>
    </div>
  );
}

function ConfirmableAction({
  label,
  description,
  confirmLabel,
  sentLabel,
  onConfirm,
  sheetOpen,
  iconBg,
  iconColor,
  icon,
}: {
  label: string;
  description: string;
  confirmLabel: string;
  sentLabel: string;
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
        <div className={`text-[15px] font-medium ${confirming ? 'text-hs-danger animate-pulse' : executed ? 'text-hs-text-faint' : 'text-hs-text-primary'}`}>
          {executed ? sentLabel : confirming ? confirmLabel : label}
        </div>
        {!confirming && !executed && (
          <div className="text-xs text-hs-text-faint mt-0.5">{description}</div>
        )}
      </div>
      {!confirming && !executed && (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-hs-text-faint shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </button>
  );
}

export default function SettingsSheet({ open, onClose, onBackup, backupBusy }: SettingsSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupDone, setBackupDone] = useState(false);
  const [themeChoice, setTheme] = useState<ThemeChoice>('dark');

  // Restore state machine: idle → confirming → busy → done/invalid-file/restore-failed
  const [restoreState, setRestoreState] = useState<'idle' | 'confirming' | 'busy' | 'done' | 'done-without-keys' | 'invalid-file' | 'restore-failed'>('idle');
  const restoreDataRef = useRef<string | null>(null);
  /** True when the selected bundle carried keys this sheet chose not to apply. */
  const credentialsSkippedRef = useRef(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await editorFetch('/api/system/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch {
      setError(t('settingsSheet.system.errorFailedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Re-fetch stats each time the sheet opens; reset data action states
  useEffect(() => {
    if (open && !loading) fetchStats();
    if (open) {
      setBackupDone(false);
      setRestoreState('idle');
      restoreDataRef.current = null;
      clearTimeout(restoreTimerRef.current);
      setTheme(getThemeChoice());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchStats and loading are intentionally excluded; we want to trigger on open, not re-trigger when stats load

  const handleBackup = async () => {
    const ok = await onBackup();
    if (ok) setBackupDone(true);
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        // Validate: must be a bundle or a legacy config
        if (data._type !== 'home-screens-backup' && !(data.screens && data.settings)) {
          setRestoreState('invalid-file');
          return;
        }
        // A bundle can carry an opt-in credential section, and an encrypted
        // one needs a password prompt this sheet deliberately doesn't have —
        // /remote manages data, the editor manages setup. Drop the section and
        // restore everything else, then say so, rather than dead-ending on a
        // `passphrase_required` the user can't act on from a phone.
        credentialsSkippedRef.current = data.credentials !== undefined;
        if (credentialsSkippedRef.current) delete data.credentials;

        restoreDataRef.current = JSON.stringify(data);
        setRestoreState('confirming');
        restoreTimerRef.current = setTimeout(() => {
          setRestoreState('idle');
          restoreDataRef.current = null;
        }, 5000);
      } catch {
        setRestoreState('invalid-file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreConfirm = async () => {
    if (!restoreDataRef.current) return;
    clearTimeout(restoreTimerRef.current);
    setRestoreState('busy');
    try {
      const res = await editorFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: restoreDataRef.current,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRestoreState(credentialsSkippedRef.current ? 'done-without-keys' : 'done');
      restoreDataRef.current = null;
    } catch {
      setRestoreState('restore-failed');
    }
  };

  const sendPower = async (action: 'restart-service' | 'reboot') => {
    try {
      await editorFetch('/api/system/power', {
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
        className={`fixed bottom-0 left-0 right-0 z-[101] bg-hs-panel rounded-t-[20px] max-h-[70dvh] overflow-y-auto transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <div className="w-9 h-[5px] rounded-full bg-hs-border-strong" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold text-hs-text-primary">{t('settingsSheet.title')}</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-hs-card flex items-center justify-center text-hs-text-muted"
            aria-label={t('settingsSheet.closeAriaLabel')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* System Info */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-2">{t('settingsSheet.system.heading')}</h3>

          {loading ? (
            <p className="text-sm text-hs-text-faint text-center py-4">{tCore('loading')}</p>
          ) : error ? (
            <p className="text-sm text-hs-danger text-center py-4">{error}</p>
          ) : stats ? (
            <div className="space-y-0">
              <div className="flex justify-between text-[13px] py-1.5">
                <span className="text-hs-text-muted">{t('settingsSheet.system.hostLabel')}</span>
                <span className="text-hs-text-primary font-medium">{stats.os.hostname}</span>
              </div>
              <div className="flex justify-between text-[13px] py-1.5 mb-2">
                <span className="text-hs-text-muted">{t('settingsSheet.system.uptimeLabel')}</span>
                <span className="text-hs-text-primary font-medium">{formatUptime(stats.os.uptime)}</span>
              </div>
              <UsageBar used={stats.memory.used} total={stats.memory.total} label={t('settingsSheet.system.memoryLabel')} color="#3b82f6" />
              <UsageBar used={stats.disk.used} total={stats.disk.total} label={t('settingsSheet.system.diskLabel')} color="#22c55e" />
            </div>
          ) : null}
        </div>

        {/* Theme */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-2">{t('settingsSheet.theme.heading')}</h3>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => { setTheme(opt); setThemeChoice(opt); }}
                className={`flex-1 py-2.5 text-[13px] font-medium rounded-lg transition-colors min-h-[44px] ${
                  themeChoice === opt
                    ? 'bg-hs-accent text-white'
                    : 'bg-hs-card text-hs-text-muted'
                }`}
              >
                {opt === 'system' ? t('settingsSheet.theme.system') : opt === 'light' ? t('settingsSheet.theme.light') : t('settingsSheet.theme.dark')}
              </button>
            ))}
          </div>
        </div>

        {/* Data */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-2">{t('settingsSheet.data.heading')}</h3>
          <button
            onClick={handleBackup}
            disabled={backupBusy || backupDone}
            className="flex items-center gap-3.5 py-3.5 w-full text-left transition-opacity active:opacity-70 disabled:opacity-40"
          >
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-hs-warning/[0.12] text-hs-warning">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[15px] font-medium ${backupDone ? 'text-hs-success' : 'text-hs-text-primary'}`}>
                {backupDone ? t('settingsSheet.data.backup.savedLabel') : backupBusy ? t('settingsSheet.data.backup.busyLabel') : t('settingsSheet.data.backup.label')}
              </div>
              {!backupBusy && !backupDone && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.backup.description')}</div>
              )}
            </div>
            {!backupBusy && !backupDone && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-hs-text-faint shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </button>

          <button
            onClick={restoreState === 'confirming' ? handleRestoreConfirm : () => restoreInputRef.current?.click()}
            disabled={restoreState === 'busy' || restoreState === 'done' || restoreState === 'done-without-keys'}
            className="flex items-center gap-3.5 py-3.5 w-full text-left transition-opacity active:opacity-70 disabled:opacity-40"
          >
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${
              restoreState === 'invalid-file' || restoreState === 'restore-failed' ? 'bg-hs-danger/[0.12] text-hs-danger' : 'bg-hs-accent-soft text-hs-accent-hover'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[15px] font-medium ${
                restoreState === 'confirming' ? 'text-hs-danger animate-pulse'
                : restoreState === 'done' || restoreState === 'done-without-keys' ? 'text-hs-success'
                : restoreState === 'invalid-file' || restoreState === 'restore-failed' ? 'text-hs-danger'
                : 'text-hs-text-primary'
              }`}>
                {restoreState === 'confirming' ? t('settingsSheet.data.restore.confirmingLabel')
                : restoreState === 'busy' ? t('settingsSheet.data.restore.busyLabel')
                : restoreState === 'done' ? t('settingsSheet.data.restore.doneLabel')
                : restoreState === 'done-without-keys' ? t('settingsSheet.data.restore.doneWithoutKeysLabel')
                : restoreState === 'invalid-file' ? t('settingsSheet.data.restore.invalidFileLabel')
                : restoreState === 'restore-failed' ? t('settingsSheet.data.restore.failedLabel')
                : t('settingsSheet.data.restore.label')}
              </div>
              {restoreState === 'idle' && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.restore.idleDescription')}</div>
              )}
              {restoreState === 'confirming' && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.restore.confirmingDescription')}</div>
              )}
              {restoreState === 'done-without-keys' && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.restore.doneWithoutKeysDescription')}</div>
              )}
            </div>
            {restoreState === 'idle' && (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-hs-text-faint shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>

        {/* Power */}
        <div className="px-5 pb-6">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-1">{t('settingsSheet.power.heading')}</h3>

          <div className="divide-y divide-hs-border">
            <ConfirmableAction
              label={t('settingsSheet.power.restartService.label')}
              description={t('settingsSheet.power.restartService.description')}
              confirmLabel={t('settingsSheet.power.restartService.confirmLabel')}
              sentLabel={t('settingsSheet.confirmable.sentLabel')}
              onConfirm={() => sendPower('restart-service')}
              sheetOpen={open}
              iconBg="bg-hs-accent-soft"
              iconColor="text-hs-accent-hover"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              }
            />

            <ConfirmableAction
              label={t('settingsSheet.power.reboot.label')}
              description={t('settingsSheet.power.reboot.description')}
              confirmLabel={t('settingsSheet.power.reboot.confirmLabel')}
              sentLabel={t('settingsSheet.confirmable.sentLabel')}
              onConfirm={() => sendPower('reboot')}
              sheetOpen={open}
              iconBg="bg-hs-danger/[0.12]"
              iconColor="text-hs-danger"
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
