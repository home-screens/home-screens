'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme';
import { formatUptime } from '@/lib/time-format';
import { editorFetch } from '@/lib/editor-fetch';
import { HubUnreachableError, refusalSentence } from '@/lib/hub-request';
import { settingsPlaceText } from '@/lib/settings-route';
import { useTranslate } from '@/i18n';
import type { SystemStats } from '@/lib/system-stats-types';
import ConfirmSheet from './ConfirmSheet';
import FormOverlay from './FormOverlay';
import PhoneFamilyManager from '@/components/family/PhoneFamilyManager';
import { ChevronRight, ImagePlus, Users } from 'lucide-react';
import CustomIconsOverlay from './CustomIconsOverlay';
import SlideUpSheet from './SlideUpSheet';
import PhoneSwitch from './PhoneSwitch';
import PrimaryButton from './PrimaryButton';
import { segmentStyle } from './remote-styles';
import { fetchCustomIconBackupSummary, getIncludeCustomIcons, setIncludeCustomIcons } from '@/lib/custom-icon-backup';
import { formatIconBytes } from '@/lib/custom-icons';
import { lacksCustomIcons, summarizeBundle } from '@/lib/backup-summary';
import {
  fetchPictureBackupSummary,
  getPictureBackupChoice,
  isZipBackup,
  nextPictureBackupChoice,
  setPictureBackupChoice,
  stageZipBackup,
  type PictureBackupChoice,
  type PictureBackupSummary,
} from '@/lib/picture-backup';
import { refreshCustomIcons, useCustomIcons } from '@/hooks/useCustomIcons';

export type PowerAction = 'restart-service' | 'reboot';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onBackup: () => Promise<boolean>;
  backupBusy: boolean;
  /** The last backup went without the family's icons (they could not be read). */
  backupIconsLeftOut?: boolean;
  /** The last backup went without the library pictures (the zip could not be made). */
  backupPicturesLeftOut?: boolean;
  /**
   * The user confirmed a restart or reboot of the hub and it was sent. The
   * parent closes this sheet and shows the reconnecting state — the silence
   * that follows is expected, not a lost connection.
   */
  onPowerAction: (action: PowerAction) => void;
}

/**
 * The full-screen Family screen. Opened from the Settings sheet's Family row
 * and from the Lists tab's item sheet when the roster is empty: over a sheet
 * either way, so it is on the rung over one.
 */
export function FamilySettingsView({ onBack }: { onBack: () => void }) {
  const t = useTranslate('core');
  const tRemote = useTranslate('remote');
  // A full-screen form like every other: Back, the Back gesture and Escape
  // all come from FormOverlay.
  return (
    <FormOverlay title={t('family.title')} onBack={onBack} layer="sheetOverSheet">
      <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.45, color: 'var(--hs-text-muted)' }}>{tRemote('settingsSheet.family.description')}</p>
      <PhoneFamilyManager />
    </FormOverlay>
  );
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

function PowerRow({
  label,
  description,
  onClick,
  iconBg,
  iconColor,
  icon,
}: {
  label: string;
  description: string;
  onClick: () => void;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 py-3.5 w-full text-left transition-opacity active:opacity-70"
    >
      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-hs-text-primary">{label}</div>
        <div className="text-xs text-hs-text-faint mt-0.5">{description}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-hs-text-faint shrink-0" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export default function SettingsSheet({ open, onClose, onBackup, backupBusy, backupIconsLeftOut = false, backupPicturesLeftOut = false, onPowerAction }: SettingsSheetProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [familyOpen, setFamilyOpen] = useState(false);
  const [iconsOpen, setIconsOpen] = useState(false);
  const { icons } = useCustomIcons();
  const [iconSummary, setIconSummary] = useState<{ count: number; bytes: number } | null>(null);
  const [includeIcons, setIncludeIcons] = useState(true);
  /** Restored items pointing at icons that were not in the backup. */
  const [missingIcons, setMissingIcons] = useState(0);
  /** Screens pointing at library pictures this hub does not hold after the restore. */
  const [missingPictures, setMissingPictures] = useState(0);
  // Which library pictures the backup carries, remembered like the icons switch.
  const [pictureChoice, setPictureChoiceState] = useState<PictureBackupChoice>('used');
  const [pictureSummary, setPictureSummary] = useState<PictureBackupSummary | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupDone, setBackupDone] = useState(false);
  const [themeChoice, setTheme] = useState<ThemeChoice>('dark');
  // Which power action is waiting on its confirm sheet, if any.
  const [confirmPower, setConfirmPower] = useState<PowerAction | null>(null);

  // Restore state machine: idle → confirming (the question is open) → busy → done/invalid-file/restore-failed
  /** Why staging a zip failed, in the family's words, when it was not simply a bad file. */
  const [restoreProblem, setRestoreProblem] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<'idle' | 'confirming' | 'busy' | 'done' | 'done-without-keys' | 'invalid-file' | 'restore-failed'>('idle');
  const restoreDataRef = useRef<string | null>(null);
  /** True when the selected bundle carried keys this sheet chose not to apply. */
  const credentialsSkippedRef = useRef(false);
  /** The chosen bundle points at pictures it does not carry. */
  const restoreLacksIconsRef = useRef(false);
  /** Pictures and their size in the chosen zip, for the confirming line. */
  const restorePicturesRef = useRef<{ count: number; bytes: number } | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

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

  // The hub-wide wait after too many wrong grown-up codes, which this
  // signed-in phone may end: whole minutes left when the sheet opened.
  const [lockedMinutes, setLockedMinutes] = useState(0);
  const [lockState, setLockState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const readCodeLock = useCallback(() => {
    editorFetch('/api/grown-up-code')
      .then((res) => (res.ok ? res.json() : null))
      .then((status: { lockedSeconds?: number } | null) => setLockedMinutes(status?.lockedSeconds ? Math.ceil(status.lockedSeconds / 60) : 0))
      .catch(() => setLockedMinutes(0));
  }, []);
  const clearCodeLock = async () => {
    setLockState('busy');
    try {
      const res = await editorFetch('/api/grown-up-code/unlock', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLockedMinutes(0);
      setLockState('idle');
    } catch {
      setLockState('failed');
    }
  };

  // Re-fetch stats each time the sheet opens; reset data action states
  useEffect(() => {
    if (open && !loading) fetchStats();
    if (open) {
      readCodeLock();
      setLockState('idle');
      setFamilyOpen(false);
      setIconsOpen(false);
      setBackupDone(false);
      setMissingIcons(0);
      setMissingPictures(0);
      setIncludeIcons(getIncludeCustomIcons());
      void fetchCustomIconBackupSummary(editorFetch).then(setIconSummary);
      setPictureChoiceState(getPictureBackupChoice());
      void fetchPictureBackupSummary(editorFetch).then(setPictureSummary);
      void refreshCustomIcons();
      setConfirmPower(null);
      setRestoreState('idle');
      restoreDataRef.current = null;
      setTheme(getThemeChoice());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchStats and loading are intentionally excluded; we want to trigger on open, not re-trigger when stats load

  const handleBackup = async () => {
    const ok = await onBackup();
    if (ok) setBackupDone(true);
  };

  const cyclePictureChoice = () => {
    const next = nextPictureBackupChoice(pictureChoice);
    setPictureChoiceState(next);
    setPictureBackupChoice(next);
  };

  /** A good file is in hand: ask before it replaces anything, as every other replace on the phone does. */
  const armRestore = (data: Record<string, unknown>) => {
    restoreDataRef.current = JSON.stringify(data);
    setRestoreState('confirming');
  };

  const cancelRestore = () => {
    setRestoreState('idle');
    restoreDataRef.current = null;
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    restorePicturesRef.current = null;
    setRestoreProblem(null);
    if (isZipBackup(file)) {
      // The zip goes to the hub once; the hub says what is inside, and the
      // restore then posts only its id. Keys are dropped the way they are
      // for a JSON backup, by the hub this time.
      e.target.value = '';
      setRestoreState('busy');
      stageZipBackup(file, editorFetch).then((staged) => {
        credentialsSkippedRef.current = staged.hasCredentials;
        restoreLacksIconsRef.current = lacksCustomIcons(staged);
        restorePicturesRef.current = staged.pictures.count > 0 ? staged.pictures : null;
        armRestore({ _archive: staged.id, ...(staged.hasCredentials ? { _withoutKeys: true } : {}) });
      }).catch((err: unknown) => {
        // Only the hub can say the file is not a backup; a hub out of reach is not the file's fault.
        setRestoreProblem(err instanceof HubUnreachableError
          ? tCore('refusals.unreachable')
          : refusalSentence(err, tCore) ?? t('settingsSheet.data.restore.failedLabel'));
        setRestoreState('restore-failed');
      });
      return;
    }
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
        const summary = summarizeBundle(data, null);
        credentialsSkippedRef.current = summary.hasCredentials;
        // A backup made with its icons left out, from a household that
        // used some: say so before it replaces anything.
        restoreLacksIconsRef.current = lacksCustomIcons(summary);
        if (credentialsSkippedRef.current) delete data.credentials;

        armRestore(data);
      } catch {
        setRestoreState('invalid-file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreConfirm = async () => {
    if (!restoreDataRef.current) return;
    setRestoreState('busy');
    try {
      const res = await editorFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: restoreDataRef.current,
        // A backup with icons is large, and a restore cut off after the hub
        // had committed it would say it failed.
        timeoutMs: null,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = (await res.json().catch(() => ({}))) as { missingIcons?: number; missingPictures?: number };
      setMissingIcons(result.missingIcons ?? 0);
      setMissingPictures(result.missingPictures ?? 0);
      void refreshCustomIcons();
      setRestoreState(credentialsSkippedRef.current ? 'done-without-keys' : 'done');
      restoreDataRef.current = null;
    } catch (err) {
      // A hub out of reach says so; anything else keeps the usual words.
      setRestoreProblem(err instanceof HubUnreachableError ? tCore('refusals.unreachable') : null);
      setRestoreState('restore-failed');
    }
  };

  const sendPower = async (action: PowerAction) => {
    setConfirmPower(null);
    try {
      await editorFetch('/api/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Best-effort — the server may already be restarting
    }
    onPowerAction(action);
  };

  return (
    <>
      <SlideUpSheet
        open={open}
        onClose={onClose}
        title={t('settingsSheet.title')}
        closeLabel={t('settingsSheet.closeAriaLabel')}
        maxHeight="70dvh"
        covered={familyOpen || iconsOpen}
      >
        <div className="px-5 pb-5">
          {lockedMinutes > 0 && (
            <div
              data-testid="grown-up-lock-card"
              style={{
                margin: '0 0 20px', padding: '14px 16px', borderRadius: 14,
                border: '1px solid color-mix(in srgb, var(--hs-warning) 45%, transparent)',
                background: 'color-mix(in srgb, var(--hs-warning) 12%, transparent)',
              }}
            >
              <b style={{ display: 'block', fontSize: 15, color: 'var(--hs-text-primary)' }}>{tCore('grownUp.lockedTitle')}</b>
              <p style={{ fontSize: 13, lineHeight: 1.4, marginTop: 4, color: 'var(--hs-text-muted)' }}>
                {t('settingsSheet.grownUpLock.body', { count: lockedMinutes })}
              </p>
              {lockState === 'failed' && (
                <p role="alert" style={{ fontSize: 13, marginTop: 6, color: 'var(--hs-danger)' }}>{tCore('grownUp.clearFailed')}</p>
              )}
              <PrimaryButton compact busy={lockState === 'busy'} onClick={() => void clearCodeLock()} style={{ marginTop: 12 }} data-testid="grown-up-lock-clear">
                {tCore('grownUp.letThemTry')}
              </PrimaryButton>
            </div>
          )}
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
              <UsageBar used={stats.memory.used} total={stats.memory.total} label={t('settingsSheet.system.memoryLabel')} color="var(--hs-accent)" />
              <UsageBar used={stats.disk.used} total={stats.disk.total} label={t('settingsSheet.system.diskLabel')} color="var(--hs-success)" />
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-2">{t('settingsSheet.theme.heading')}</h3>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={themeChoice === opt}
                onClick={() => { setTheme(opt); setThemeChoice(opt); }}
                style={segmentStyle(themeChoice === opt)}
              >
                {opt === 'system' ? t('settingsSheet.theme.system') : opt === 'light' ? t('settingsSheet.theme.light') : t('settingsSheet.theme.dark')}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-2">{t('settingsSheet.data.heading')}</h3>
          <PowerRow
            label={tCore('family.title')}
            description={t('settingsSheet.family.description')}
            onClick={() => setFamilyOpen(true)}
            iconBg="bg-hs-accent-soft"
            iconColor="text-hs-accent"
            icon={<Users size={18} />}
          />
          <PowerRow
            label={tCore('customIcons.yourIcons')}
            description={tCore('customIcons.settingsRow.description', { count: icons.length })}
            onClick={() => setIconsOpen(true)}
            iconBg="bg-hs-warning/[0.12]"
            iconColor="text-hs-warning-ink"
            icon={<ImagePlus size={18} />}
          />
          {/* Above the Backup row it changes: read top to bottom, the row
              downloaded before anyone reached a switch placed under it. The
              whole row toggles, not just the knob. */}
          {iconSummary && iconSummary.count > 0 && (
            <PhoneSwitch
              checked={includeIcons}
              onChange={(next) => { setIncludeIcons(next); setIncludeCustomIcons(next); }}
              label={tCore('customIcons.backup.include')}
              description={includeIcons
                ? tCore('customIcons.backup.adds', { size: formatIconBytes(iconSummary.bytes) })
                : tCore('customIcons.backup.leftOutWhenOff')}
              // In line with the rows' words, past the space their icons take.
              style={{ minHeight: 52, padding: '12px 0 12px 48px' }}
            />
          )}
          {pictureSummary && pictureSummary.all.count > 0 && (
            <button
              type="button"
              onClick={cyclePictureChoice}
              className="w-full flex items-center gap-3 py-3 text-left min-h-[52px]"
              data-testid="remote-backup-pictures"
            >
              <div className="w-9 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-hs-text-primary">{tCore('pictureBackup.phoneRow')}</div>
                {/* The state sits under the title, not in a pill beside it:
                    "Only the ones on screen · 0.2 MB" is wider than half a
                    phone in every language and pushed the title onto two lines. */}
                <div className={`text-xs mt-0.5 ${pictureChoice === 'off' ? 'text-hs-text-faint' : 'text-hs-accent-hover'}`}>
                  {pictureChoice === 'off'
                    ? tCore('pictureBackup.phoneOff')
                    : `${tCore(pictureChoice === 'used' ? 'pictureBackup.phoneUsed' : 'pictureBackup.phoneAll')} · ${formatIconBytes(pictureSummary[pictureChoice].bytes)}`}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-hs-text-faint shrink-0" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={handleBackup}
            // Left enabled when the icons or pictures were left out, so a tap tries again.
            disabled={backupBusy || (backupDone && !backupIconsLeftOut && !backupPicturesLeftOut)}
            className="flex items-center gap-3.5 py-3.5 w-full text-left transition-opacity active:opacity-70 disabled:opacity-40"
          >
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-hs-warning/[0.12] text-hs-warning-ink">
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
              {!backupBusy && backupDone && backupIconsLeftOut && (
                <div role="status" className="text-xs text-hs-warning-ink mt-0.5">{tCore('customIcons.backup.leftOut')}</div>
              )}
              {!backupBusy && backupDone && !backupIconsLeftOut && backupPicturesLeftOut && (
                <div role="status" className="text-xs text-hs-warning-ink mt-0.5">{tCore('pictureBackup.leftOut')}</div>
              )}
            </div>
            {!backupBusy && !backupDone && (
              <ChevronRight className="w-4 h-4 text-hs-text-faint shrink-0" strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          <button
            onClick={() => restoreInputRef.current?.click()}
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
                restoreState === 'done' || restoreState === 'done-without-keys' ? 'text-hs-success'
                : restoreState === 'invalid-file' || restoreState === 'restore-failed' ? 'text-hs-danger'
                : 'text-hs-text-primary'
              }`}>
                {restoreState === 'busy' ? t('settingsSheet.data.restore.busyLabel')
                : restoreState === 'done' ? t('settingsSheet.data.restore.doneLabel')
                : restoreState === 'done-without-keys' ? t('settingsSheet.data.restore.doneWithoutKeysLabel')
                : restoreState === 'invalid-file' ? tCore('refusals.backup.notABackup')
                : restoreState === 'restore-failed' ? restoreProblem ?? t('settingsSheet.data.restore.failedLabel')
                : t('settingsSheet.data.restore.label')}
              </div>
              {(restoreState === 'idle' || restoreState === 'confirming') && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.restore.idleDescription')}</div>
              )}
              {restoreState === 'done-without-keys' && (
                <div className="text-xs text-hs-text-faint mt-0.5">{t('settingsSheet.data.restore.doneWithoutKeysDescription')}</div>
              )}
            </div>
            {(restoreState === 'idle' || restoreState === 'confirming') && (
              <ChevronRight className="w-4 h-4 text-hs-text-faint shrink-0" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,.zip,application/zip"
            className="hidden"
            onChange={handleRestoreFile}
          />
          {missingIcons > 0 && (restoreState === 'done' || restoreState === 'done-without-keys') && (
            <p role="status" className="text-sm text-hs-warning-ink border border-hs-warning/40 bg-hs-warning/10 rounded-xl px-3.5 py-3 mt-1">
              {tCore('customIcons.backup.missing')}
            </p>
          )}
          {missingPictures > 0 && (restoreState === 'done' || restoreState === 'done-without-keys') && (
            <p role="status" className="text-sm text-hs-warning-ink border border-hs-warning/40 bg-hs-warning/10 rounded-xl px-3.5 py-3 mt-1">
              {tCore('pictureBackup.phoneRestoreMissing', { place: settingsPlaceText(tCore, 'media') })}
            </p>
          )}
        </div>

        <div className="px-5 pb-6">
          <h3 className="text-xs font-semibold text-hs-text-faint uppercase tracking-wider mb-1">{t('settingsSheet.power.heading')}</h3>

          {/* An update finished that the wall only picks up after a restart.
              Parents may never open the editor, so the phone says it too; the
              button asks through the same confirm as Restart everything below. */}
          {stats?.restartNeeded && (
            <div
              data-testid="remote-restart-needed"
              className="rounded-2xl border border-hs-accent/40 bg-hs-accent-soft p-4 mt-2 mb-2"
            >
              <div className="text-[15px] font-semibold text-hs-text-primary">{t('settingsSheet.power.restartNeeded.title')}</div>
              <div className="text-[13px] text-hs-text-muted mt-1">{t('settingsSheet.power.restartNeeded.description')}</div>
              <PrimaryButton onClick={() => setConfirmPower('reboot')} style={{ marginTop: 12 }}>
                {t('settingsSheet.power.restartNeeded.button')}
              </PrimaryButton>
            </div>
          )}

          <div className="divide-y divide-hs-border">
            <PowerRow
              label={t('settingsSheet.power.restartService.label')}
              description={t('settingsSheet.power.restartService.description')}
              onClick={() => setConfirmPower('restart-service')}
              iconBg="bg-hs-accent-soft"
              iconColor="text-hs-accent-hover"
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              }
            />

            <PowerRow
              label={t('settingsSheet.power.reboot.label')}
              description={t('settingsSheet.power.reboot.description')}
              onClick={() => setConfirmPower('reboot')}
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
      </SlideUpSheet>

      {open && familyOpen && <FamilySettingsView onBack={() => setFamilyOpen(false)} />}
      {open && iconsOpen && <CustomIconsOverlay onBack={() => setIconsOpen(false)} />}

      {restoreState === 'confirming' && (
        <ConfirmSheet
          title={t('settingsSheet.data.restore.confirmTitle')}
          description={[
            t('settingsSheet.data.restore.confirmingDescription'),
            restoreLacksIconsRef.current && tCore('customIcons.backup.restoreNoIcons'),
            restorePicturesRef.current && tCore('pictureBackup.restoreConfirm', { count: restorePicturesRef.current.count, size: formatIconBytes(restorePicturesRef.current.bytes) }),
          ].filter(Boolean).join(' ')}
          confirmLabel={t('settingsSheet.data.restore.confirmButton')}
          onConfirm={() => void handleRestoreConfirm()}
          onCancel={cancelRestore}
        />
      )}

      {confirmPower && (
        <ConfirmSheet
          title={t(`settingsSheet.power.${confirmPower === 'reboot' ? 'reboot' : 'restartService'}.confirmTitle`)}
          description={t(`settingsSheet.power.${confirmPower === 'reboot' ? 'reboot' : 'restartService'}.confirmBody`)}
          confirmLabel={t(`settingsSheet.power.${confirmPower === 'reboot' ? 'reboot' : 'restartService'}.confirmButton`)}
          tone={confirmPower === 'reboot' ? 'danger' : 'primary'}
          onConfirm={() => void sendPower(confirmPower)}
          onCancel={() => setConfirmPower(null)}
        />
      )}
    </>
  );
}
