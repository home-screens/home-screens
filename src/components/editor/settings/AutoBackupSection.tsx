'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import HomeTimeHint from '@/components/editor/HomeTimeHint';
import BackupPasswordModal from '@/components/editor/settings/BackupPasswordModal';
import { SettingsPanel, SettingsPanelPart, SettingsPanelState } from '@/components/editor/settings/shared/SettingsPanel';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatDateInTZ, formatTimeInTZ, isoDateInTZ, type ClockFormat } from '@/lib/timezone';
import { formatIconBytes } from '@/lib/custom-icons';
import { settingsHref } from '@/lib/settings-route';
import { copyText } from '@/lib/clipboard';
import { AUTO_BACKUP_FREQUENCIES, AUTO_BACKUP_KEEP_CHOICES, resolveAutoBackupSettings } from '@/lib/auto-backup-policy';
import { folderHostLabel, warnsPlainHttp } from '@/lib/webdav-url';
import { addressKind, formatShareAddress, parseShareAddress, splitAccountName, warnsOutsideHome, withShare } from '@/lib/share-address';
import { sameServer, type DestinationSummary, type StorageKind } from '@/lib/storage-destination';
import { draftServer } from '@/lib/auto-backup-destination';
import type { AutoBackupSettings } from '@/types/config';
import type { AutoBackupCopyInfo, AutoBackupStatus, BackupContentsSummary } from '@/lib/auto-backup-types';
import type { PictureBackupSummary } from '@/lib/picture-backup';
import { useAutoBackup, type FolderCheck, type FolderDraft } from './useAutoBackup';

const TIME_RE = /^\d{2}:\d{2}$/;
/** Copies shown before "Show all". */
const COPIES_SHOWN = 5;
const K = 'settings.dataPage.autoBackup';

export interface AutoCopyRestore {
  copy: AutoBackupCopyInfo;
  summary: BackupContentsSummary;
  hasSavedPassword: boolean;
}

interface Props {
  /** Counts and sizes for the Pictures choice; shared with Save a copy. */
  pictureSummary: PictureBackupSummary | null;
  /** A restore is running anywhere on the page. */
  restoreBusy: boolean;
  /**
   * Restore a kept copy once it is confirmed here. The page's restore flow
   * owns the password prompt, the icon warning and the reload.
   */
  onRestoreCopy: (restore: AutoCopyRestore) => Promise<void>;
}

/** Day words for past and coming moments on the household's clock. */
function useWhen(today: string | undefined) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));
  return useMemo(() => {
    const fmt: ClockFormat = { timezone, locale, hour12: timeFormat === '12h' };
    const dayGap = (date: string) => today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) : NaN;
    return {
      /** "today at 3:00 AM", "yesterday at…", "Sunday at…", "Nov 8 at…". */
      past(iso: string): string {
        const at = new Date(iso);
        const time = formatTimeInTZ(at, fmt);
        const gap = dayGap(isoDateInTZ(at, timezone));
        if (gap === 0) return t(`${K}.when.today`, { time });
        if (gap === 1) return t(`${K}.when.yesterday`, { time });
        if (gap > 1 && gap < 7) return t(`${K}.when.day`, { day: formatDateInTZ(at, timezone, { weekday: 'long' }, locale), time });
        return t(`${K}.when.day`, { day: formatDateInTZ(at, timezone, { month: 'short', day: 'numeric' }, locale), time });
      },
      /** A wall moment from the hub: "today at…", "tomorrow at…", "Sunday, Nov 22 at…". */
      next(moment: { date: string; time: string }): string {
        const [y, mo, d] = moment.date.split('-').map(Number);
        const [h, mi] = moment.time.split(':').map(Number);
        const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
        const time = formatTimeInTZ(at, { ...fmt, timezone: 'UTC' });
        const gap = dayGap(moment.date);
        if (gap === 0) return t(`${K}.when.today`, { time });
        if (gap === -1) return t(`${K}.when.tomorrow`, { time });
        return t(`${K}.when.day`, { day: formatDateInTZ(at, 'UTC', { weekday: 'long', month: 'short', day: 'numeric' }, locale), time });
      },
      /** A copy's date inside a sentence: "Sunday, Nov 15 at 3:00 AM". */
      full(iso: string): string {
        const at = new Date(iso);
        return t(`${K}.when.day`, {
          day: formatDateInTZ(at, timezone, { weekday: 'long', month: 'short', day: 'numeric' }, locale),
          time: formatTimeInTZ(at, fmt),
        });
      },
      /** The same, starting a line: several languages write weekdays in lower case. */
      title(iso: string): string {
        const label = this.full(iso);
        return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
      },
    };
  }, [t, locale, timezone, timeFormat, today]);
}

/**
 * Settings > Backups & data: save backups by themselves, keep the newest on
 * the hub, and send each one somewhere else. The schedule saves with the
 * config like any setting; passwords, the storage folder and the link go
 * straight to the hub and never enter the editor's undo history.
 */
export default function AutoBackupSection({ pictureSummary, restoreBusy, onRestoreCopy }: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const { updateSettings, saveConfig } = useEditorStore();
  const saved = useEditorStore((s) => s.config?.settings?.autoBackup);
  const settings = resolveAutoBackupSettings(saved);
  const backup = useAutoBackup();
  const { status } = backup;
  const when = useWhen(status?.today);
  const timeInputId = useId();
  const [saveError, setSaveError] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [choosingPassword, setChoosingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const save = useCallback(async (next: Partial<AutoBackupSettings>) => {
    const current = useEditorStore.getState().config?.settings?.autoBackup;
    updateSettings({ autoBackup: { enabled: current?.enabled ?? false, ...current, ...next } });
    setSaveError(false);
    try {
      await saveConfig();
      await backup.refresh();
    } catch {
      setSaveError(true);
    }
  }, [updateSettings, saveConfig, backup]);

  const backUpNow = async () => {
    setRunMessage(null);
    const refused = await backup.backUpNow();
    if (refused) setRunMessage(t(`${K}.runRefused.${refused}`));
  };

  const savePassword = async (password: string) => {
    setPasswordError(null);
    const code = await backup.saveSecrets({ backupPassword: password });
    if (code) {
      setPasswordError(code === 'editor_password_required' ? t(`${K}.keys.needsEditorPassword`) : t(`${K}.saveFailed`));
      return;
    }
    setChoosingPassword(false);
  };

  return (
    <SettingsPanel
      title={t(`${K}.heading`)}
      badge={<SettingsPanelState on={settings.enabled} onLabel={t(`${K}.stateOn`)} offLabel={t(`${K}.stateOff`)} />}
      description={t(`${K}.description`)}
      data-field-id="data.autoBackup"
      data-testid="auto-backup"
    >
      <SettingsPanelPart heading={settings.enabled ? t(`${K}.scheduleHeading`) : undefined}>
        <div data-field-id="data.autoBackupEnabled">
          <Toggle label={t(`${K}.toggleLabel`)} checked={settings.enabled} onChange={(enabled) => void save({ enabled })} />
        </div>

        {settings.enabled && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3" data-field-id="data.autoBackupEvery">
              <span className="text-xs text-hs-text-muted">{t(`${K}.everyLabel`)}</span>
              <select
                value={settings.every}
                onChange={(e) => void save({ every: e.target.value as AutoBackupSettings['every'] })}
                className="bg-hs-card border border-hs-border-strong rounded-md text-xs text-hs-text-body px-2 py-1"
              >
                {AUTO_BACKUP_FREQUENCIES.map((every) => (
                  <option key={every} value={every}>{t(`${K}.every.${every}`)}</option>
                ))}
              </select>
            </label>

            <div data-field-id="data.autoBackupTime">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label htmlFor={timeInputId} className="block text-xs text-hs-text-muted">{t(`${K}.timeLabel`)}</label>
                  <p className="text-xs text-hs-text-faint mt-0.5">{t(`${K}.timeHelp`)}</p>
                </div>
                <input
                  id={timeInputId}
                  type="time"
                  value={settings.time}
                  onChange={(e) => { if (TIME_RE.test(e.target.value)) void save({ time: e.target.value }); }}
                  className="w-32 shrink-0 rounded-md bg-hs-card border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
                />
              </div>
              <HomeTimeHint />
            </div>

            <div className="flex items-center justify-between gap-3" data-field-id="data.autoBackupKeep">
              <div>
                <span className="block text-xs text-hs-text-muted">{t(`${K}.keepLabel`)}</span>
                <p className="text-xs text-hs-text-faint mt-0.5">{t(`${K}.keepHelp`)}</p>
              </div>
              <label className="flex items-center gap-2 shrink-0">
                <select
                  aria-label={t(`${K}.keepLabel`)}
                  value={settings.keep}
                  onChange={(e) => void save({ keep: Number(e.target.value) })}
                  className="bg-hs-card border border-hs-border-strong rounded-md text-xs text-hs-text-body px-2 py-1"
                >
                  {[...new Set([...AUTO_BACKUP_KEEP_CHOICES, settings.keep])].sort((a, b) => a - b).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-xs text-hs-text-muted">{t(`${K}.keepUnit`, { count: settings.keep })}</span>
              </label>
            </div>

            {/* Like Save a copy: no choice to make while the library is empty,
                unless one was made before it emptied and has to be undone. */}
            {pictureSummary && (pictureSummary.all.count > 0 || settings.pictures !== 'off') && (
            <fieldset className="space-y-1.5" data-field-id="data.autoBackupPictures">
              <legend className="text-xs text-hs-text-muted mb-1">{tCore('pictureBackup.heading')}</legend>
              {(['off', 'used', 'all'] as const).map((choice) => {
                const count = choice === 'off' || !pictureSummary ? null : pictureSummary[choice];
                return (
                  <label key={choice} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="auto-backup-pictures"
                      value={choice}
                      checked={settings.pictures === choice}
                      onChange={() => void save({ pictures: choice })}
                      className="accent-hs-accent mt-0.5"
                    />
                    <span className="block text-xs text-hs-text-body">
                      {tCore(`pictureBackup.${choice}`)}
                      {count && (
                        <span className="text-hs-text-faint">
                          {' '}({tCore('pictureBackup.files', { count: count.count })}, {formatIconBytes(count.bytes, locale)})
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              <p className="text-xs text-hs-text-faint pl-6">{t(`${K}.picturesHelp`)}</p>
            </fieldset>
            )}

            <KeysChoice
              includeKeys={settings.includeKeys}
              status={status}
              onToggle={(includeKeys) => void save({ includeKeys })}
              onChoosePassword={() => { setPasswordError(null); setChoosingPassword(true); }}
            />

            {status && <RunLines status={status} when={when} />}

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={backUpNow} disabled={backup.running || restoreBusy} data-field-id="data.autoBackupNow">
                {backup.running ? t(`${K}.backingUp`) : t(`${K}.backUpNow`)}
              </Button>
              {runMessage && <p className="text-xs text-hs-warning" role="alert">{runMessage}</p>}
            </div>
          </div>
        )}

        {backup.loadFailed && settings.enabled && (
          <p className="text-xs text-hs-danger mt-2" role="alert">{t(`${K}.loadFailed`)}</p>
        )}
        {saveError && (
          <p className="text-xs text-hs-danger mt-2" role="alert">{t('common.saveFailed')}</p>
        )}
        {choosingPassword && (
          <BackupPasswordModal
            mode="set"
            purpose="save"
            error={passwordError}
            onSubmit={(password) => void savePassword(password)}
            onClose={() => setChoosingPassword(false)}
          />
        )}
      </SettingsPanelPart>

      {settings.enabled && status && <Offsite status={status} backup={backup} when={when} />}

      {settings.enabled && status && (
        <CopiesList
          status={status}
          when={when}
          restoreBusy={restoreBusy || backup.running}
          onRestore={onRestoreCopy}
          backup={backup}
        />
      )}
    </SettingsPanel>
  );
}

function KeysChoice({ includeKeys, status, onToggle, onChoosePassword }: {
  includeKeys: boolean;
  status: AutoBackupStatus | null;
  onToggle: (on: boolean) => void;
  onChoosePassword: () => void;
}) {
  const t = useTranslate('editor');
  const noEditorPassword = status?.editorPasswordSet === false;
  return (
    <div data-field-id="data.autoBackupKeys">
      <label className={`flex items-start gap-2.5 ${noEditorPassword ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={includeKeys && !noEditorPassword}
          disabled={noEditorPassword}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-hs-accent mt-0.5"
        />
        <span>
          <span className="block text-xs text-hs-text-body">{t(`${K}.keys.label`)}</span>
          <span className="block text-xs text-hs-text-faint">
            {noEditorPassword ? t(`${K}.keys.needsEditorPassword`) : t(`${K}.keys.help`)}
          </span>
        </span>
      </label>
      {noEditorPassword && (
        <a
          href={settingsHref({ kind: 'defaults', page: 'security' }, { highlight: 'security.changePassword' })}
          className="ml-6 mt-1 inline-block text-xs text-hs-accent-hover hover:underline"
        >
          {t(`${K}.keys.setEditorPassword`)}
        </a>
      )}
      {includeKeys && !noEditorPassword && status && (
        status.hasBackupPassword ? (
          <div className="ml-6 mt-2 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-hs-success">{t(`${K}.keys.passwordSaved`)}</span>
              <button onClick={onChoosePassword} className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors">
                {t(`${K}.keys.change`)}
              </button>
            </div>
            <p className="text-xs text-hs-text-faint">{t(`${K}.keys.passwordNote`)}</p>
          </div>
        ) : (
          <div className="ml-6 mt-2 rounded-md border border-hs-warning/40 bg-hs-warning/10 px-3 py-2.5" role="status">
            <p className="text-xs text-hs-warning">{t(`${K}.keys.passwordMissing`)}</p>
            <Button variant="warning" onClick={onChoosePassword} className="mt-2">{t(`${K}.keys.choosePassword`)}</Button>
          </div>
        )
      )}
    </div>
  );
}

type When = ReturnType<typeof useWhen>;

/** "Last backup", "Last good backup" and "Next backup" (or "Next try"). */
function RunLines({ status, when }: { status: AutoBackupStatus; when: When }) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const failed = !!status.lastError && !!status.lastAttemptAt;
  const offsiteSetUp = !!status.destination || status.hasLink;
  let last: { text: string; warning: boolean } | null = null;
  if (failed) {
    last = {
      text: t(`${K}.last.failed`, { when: when.past(status.lastAttemptAt!), reason: t(`${K}.errors.${status.lastError}`) }),
      warning: true,
    };
  } else if (status.lastOkAt) {
    const at = when.past(status.lastOkAt);
    if (status.picturesLeftOut) {
      last = {
        text: t(`${K}.last.noPictures`, {
          when: at,
          needed: formatIconBytes(status.picturesLeftOut.neededBytes, locale),
          free: formatIconBytes(status.picturesLeftOut.freeBytes, locale),
        }),
        warning: true,
      };
    } else if (status.keysLeftOut) {
      last = { text: t(`${K}.last.noKeys`, { when: at }), warning: true };
    } else if (status.offsite.lastOkAt && status.offsite.lastOkAt >= status.lastOkAt) {
      last = { text: t(`${K}.last.sent`, { when: at }), warning: false };
    } else {
      last = { text: at, warning: false };
    }
  }
  return (
    <div className="space-y-0.5 text-xs" data-testid="auto-backup-status">
      {last && (
        <p>
          <span className="text-hs-text-faint">{t(`${K}.lastLabel`)}</span>{' '}
          <span className={last.warning ? 'text-hs-warning' : 'text-hs-text-secondary'}>{last.text}</span>
        </p>
      )}
      {failed && status.lastOkAt && (
        <p>
          <span className="text-hs-text-faint">{t(`${K}.lastGoodLabel`)}</span>{' '}
          <span className="text-hs-text-secondary">{when.past(status.lastOkAt)}</span>
        </p>
      )}
      {status.nextRun && (
        <p>
          <span className="text-hs-text-faint">{failed ? t(`${K}.nextTryLabel`) : t(`${K}.nextLabel`)}</span>{' '}
          <span className="text-hs-text-secondary">{when.next(status.nextRun)}</span>
        </p>
      )}
      {!offsiteSetUp && status.lastOkAt && (
        <p className="pt-1.5 text-hs-warning">{t(`${K}.onlyHere`)}</p>
      )}
    </div>
  );
}

type Backup = ReturnType<typeof useAutoBackup>;

function Offsite({ status, backup, when }: { status: AutoBackupStatus; backup: Backup; when: When }) {
  const t = useTranslate('editor');
  return (
    <SettingsPanelPart heading={t(`${K}.offsite.heading`)}>
      <div className="space-y-2.5">
        <p className="text-xs text-hs-text-faint">{t(`${K}.offsite.description`)}</p>
        <FolderCard status={status} backup={backup} when={when} />
        <LinkCard status={status} backup={backup} when={when} />
      </div>
    </SettingsPanelPart>
  );
}

const cardClass = 'rounded-lg bg-hs-card border border-hs-border px-3.5 py-3';
const linkButton = 'text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors disabled:opacity-50';

function Dot({ tone }: { tone: 'good' | 'bad' | 'idle' }) {
  const color = tone === 'good' ? 'bg-hs-success' : tone === 'bad' ? 'bg-hs-warning' : 'bg-hs-text-faint';
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color} mt-[5px]`} />;
}

/** The form's values for a saved folder: its address the way a computer shows it, and `DOMAIN\name` back together. */
function draftFor(dest: DestinationSummary): FolderDraft {
  if (dest.kind === 'webdav') return { kind: 'webdav', address: dest.url, username: dest.username, password: '' };
  return {
    kind: 'smb',
    address: formatShareAddress(dest),
    username: dest.domain ? `${dest.domain}\\${dest.username}` : dest.username,
    password: '',
  };
}

/** The words a reason or a status line fills in: who signs in, and where. */
type FolderWords = Record<'user' | 'share' | 'host', string>;

function draftWords(draft: FolderDraft): FolderWords {
  if (draft.kind === 'webdav') return { user: draft.username.trim(), share: '', host: folderHostLabel(draft.address) };
  const parsed = parseShareAddress(draft.address);
  const user = splitAccountName(draft.username).username;
  return 'problem' in parsed ? { user, share: '', host: '' } : { user, share: parsed.share, host: parsed.host };
}

function summaryWords(dest: DestinationSummary): FolderWords {
  if (dest.kind === 'webdav') return { user: dest.username, share: '', host: folderHostLabel(dest.url) };
  return { user: dest.username, share: dest.share, host: dest.host };
}

const inputClass = 'w-full rounded-md bg-hs-input border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body placeholder:text-hs-text-faint focus:border-hs-accent focus:outline-none';

function KindChoice({ kind, onChange }: { kind: StorageKind; onChange: (kind: StorageKind) => void }) {
  const t = useTranslate('editor');
  const id = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs text-hs-text-muted mb-1">{t(`${K}.folder.kindLegend`)}</legend>
      {(['smb', 'webdav'] as const).map((choice) => (
        <div key={choice} className="flex items-start gap-2.5">
          <input
            id={`${id}-${choice}`}
            type="radio"
            name={`${id}-kind`}
            value={choice}
            checked={kind === choice}
            onChange={() => onChange(choice)}
            aria-describedby={`${id}-${choice}-help`}
            className="accent-hs-accent mt-0.5 cursor-pointer"
          />
          <div className="min-w-0">
            <label htmlFor={`${id}-${choice}`} className="block text-xs text-hs-text-primary cursor-pointer">
              {t(`${K}.folder.${choice === 'smb' ? 'kindShare' : 'kindWebdav'}`)}
            </label>
            <p id={`${id}-${choice}-help`} className="text-xs text-hs-text-faint">
              {t(`${K}.folder.${choice === 'smb' ? 'kindShareHelp' : 'kindWebdavHelp'}`)}
            </p>
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function FolderCard({ status, backup, when }: { status: AutoBackupStatus; backup: Backup; when: When }) {
  const t = useTranslate('editor');
  const dest = status.destination;
  const [editing, setEditing] = useState(false);
  // A new folder starts on Network share: what a NAS, a Windows PC or a Mac offers without extra setup.
  const [draft, setDraft] = useState<FolderDraft>({ kind: 'smb', address: '', username: '', password: '' });
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<FolderCheck | { saveCode: string } | null>(null);
  // What the last check in the form was for, so its sentence names that share.
  const [checkedDraft, setCheckedDraft] = useState<FolderDraft | null>(null);
  // Goes up with every edit, and on opening or leaving the form. A check or
  // save that comes back for an older version is about values no longer on
  // screen, so its answer is dropped rather than shown under the new ones.
  const formVersion = useRef(0);

  const draftTarget = draftServer(draft.kind, draft.address);
  // Only then does the hub keep the saved password for an empty box.
  const keepsSavedPassword = !!dest && !!draftTarget && sameServer(dest, draftTarget);
  const newServerPassword = !!result && 'saveCode' in result && result.saveCode === 'password_required' && !!dest && !keepsSavedPassword && !draft.password;

  const open = () => {
    formVersion.current++;
    setDraft(dest ? draftFor(dest) : { kind: 'smb', address: '', username: '', password: '' });
    setResult(null);
    setCheckedDraft(null);
    setEditing(true);
  };
  const check = async (withDraft: boolean, target: FolderDraft = draft) => {
    const version = formVersion.current;
    setChecking(true);
    setResult(null);
    setCheckedDraft(withDraft ? target : null);
    const answer = await backup.checkFolder(withDraft ? target : undefined);
    setChecking(false);
    if (version === formVersion.current) setResult(answer);
  };
  const saveFolder = async () => {
    const version = formVersion.current;
    setSaving(true);
    setResult(null);
    const code = await backup.saveSecrets({ destination: draft });
    setSaving(false);
    // Edited while saving: the hub has the values as they were, the form
    // keeps the newer ones open for another Save.
    if (version !== formVersion.current) return;
    if (code) setResult({ saveCode: code });
    else setEditing(false);
  };
  const close = () => {
    formVersion.current++;
    setResult(null);
    setEditing(false);
  };
  const stop = async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t(`${K}.folder.removeConfirm.title`),
      message: t(`${K}.folder.removeConfirm.message`),
      confirmLabel: t(`${K}.folder.removeConfirm.confirm`),
      variant: 'danger',
    });
    if (!ok) return;
    await backup.saveSecrets({ destination: null });
    close();
  };
  // Any change to the form makes the last answer about different values,
  // so it goes: "It works" must never sit under an address it did not check.
  const edit = (patch: Partial<FolderDraft>) => {
    formVersion.current++;
    setDraft((current) => ({ ...current, ...patch }));
    setResult(null);
    setCheckedDraft(null);
  };
  // Pasting an address of the other kind moves the choice to it, keeping what was typed.
  const setAddress = (address: string) => {
    const kind = addressKind(address);
    edit({ address, ...(kind ? { kind } : {}) });
  };
  // A share from the storage's own list goes into the address, keeping the folder, and is checked again.
  const pickShare = (share: string) => {
    const address = withShare(draft.address, share);
    if (!address) return;
    edit({ address });
    void check(true, { ...draft, address });
  };

  const words = editing ? draftWords(checkedDraft ?? draft) : dest ? summaryWords(dest) : { user: '', share: '', host: '' };
  const kindNow = editing ? draft.kind : dest?.kind ?? 'webdav';

  const resultLine = (() => {
    if (!result) return null;
    if ('saveCode' in result) {
      if (newServerPassword) {
        return <p className="text-xs text-hs-warning" role="alert">{t(`${K}.folder.passwordNewServer`, { host: draftWords(draft).host })}</p>;
      }
      return <p className="text-xs text-hs-warning" role="alert">{t(`${K}.folder.formErrors.${KNOWN_FORM_CODES.has(result.saveCode) ? result.saveCode : 'failed'}`)}</p>;
    }
    if (result.ok) {
      return <p className="text-xs text-hs-success" role="status">{t(`${K}.folder.${kindNow === 'smb' ? 'worksShare' : 'works'}`)}</p>;
    }
    if ('formCode' in result) {
      return <p className="text-xs text-hs-warning" role="alert">{t(`${K}.folder.formErrors.${KNOWN_FORM_CODES.has(result.formCode) ? result.formCode : 'failed'}`)}</p>;
    }
    if (result.code === 'share-not-found' && editing && result.shares && result.shares.length > 0) {
      return (
        <div role="alert">
          <p className="text-xs text-hs-warning">{t(`${K}.folder.sharesOffered`, words)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="auto-backup-share-choices">
            {result.shares.map((share) => (
              <button
                key={share}
                type="button"
                onClick={() => pickShare(share)}
                disabled={checking}
                className="rounded-full border border-hs-border-strong bg-hs-input px-2.5 py-0.5 text-xs text-hs-text-body hover:border-hs-accent hover:text-hs-accent-hover transition-colors disabled:opacity-50"
              >
                {share}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return <p className="text-xs text-hs-warning" role="alert">{t(`${K}.offsiteErrors.${result.code}`, words)}</p>;
  })();

  if (editing) {
    const isShare = draft.kind === 'smb';
    return (
      <div className={cardClass} data-field-id="data.autoBackupFolder" data-testid="auto-backup-folder">
        <p className="text-sm text-hs-text-primary">{t(`${K}.folder.name`)}</p>
        <div className="mt-3 border-t border-hs-border pt-3 space-y-2.5">
          <KindChoice kind={draft.kind} onChange={(kind) => edit({ kind })} />
          <label className="block pt-1">
            <span className="block text-xs text-hs-text-muted mb-1">{t(`${K}.folder.${isShare ? 'shareAddress' : 'address'}`)}</span>
            <input
              type={isShare ? 'text' : 'url'}
              value={draft.address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={isShare ? '\\\\nas.local\\Backups\\home-screens' : 'https://cloud.example.com/remote.php/dav/files/taylor/Backups/'}
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
            <span className="block text-xs text-hs-text-faint mt-1">{t(`${K}.folder.${isShare ? 'shareAddressHelp' : 'addressHelp'}`)}</span>
          </label>
          {(isShare ? warnsOutsideHome(draft.address) : warnsPlainHttp(draft.address)) && (
            <p className="text-xs text-hs-warning border border-hs-warning/40 bg-hs-warning/10 rounded-md px-2.5 py-2" role="status">
              {t(`${K}.folder.${isShare ? 'outsideHomeWarning' : 'httpWarning'}`)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-hs-text-muted mb-1">{t(`${K}.folder.username`)}</span>
              <input
                value={draft.username}
                onChange={(e) => edit({ username: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-hs-text-muted mb-1">{t(`${K}.folder.password`)}</span>
              <input
                type="password"
                value={draft.password}
                onChange={(e) => edit({ password: e.target.value })}
                placeholder={keepsSavedPassword ? t(`${K}.folder.passwordKeep`) : ''}
                autoComplete="new-password"
                className={`${inputClass}${newServerPassword ? ' !border-hs-warning' : ''}`}
              />
            </label>
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <Button variant="secondary" onClick={() => void check(true)} disabled={checking || saving || !draft.address.trim()}>
              {checking ? t(`${K}.folder.checking`) : t(`${K}.folder.check`)}
            </Button>
            <Button variant="primary" onClick={() => void saveFolder()} disabled={checking || saving || !draft.address.trim()}>
              {t(`${K}.folder.save`)}
            </Button>
            <button onClick={close} className={linkButton}>{t(`${K}.folder.cancel`)}</button>
            {dest && (
              <button onClick={() => void stop()} className={`${linkButton} ml-auto`}>{t(`${K}.folder.remove`)}</button>
            )}
          </div>
          {resultLine}
        </div>
      </div>
    );
  }

  if (!dest) {
    return (
      <div className={`${cardClass} flex items-start gap-3`} data-field-id="data.autoBackupFolder" data-testid="auto-backup-folder">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-hs-text-primary">{t(`${K}.folder.name`)}</p>
          <p className="text-xs text-hs-text-faint mt-0.5">{t(`${K}.folder.description`)}</p>
        </div>
        <Button variant="secondary" onClick={open}>{t(`${K}.folder.setUp`)}</Button>
      </div>
    );
  }

  const failing = !!status.offsite.lastError && status.offsite.pending;
  return (
    <div className={cardClass} data-field-id="data.autoBackupFolder" data-testid="auto-backup-folder">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-hs-text-primary">{t(`${K}.folder.name`)}</p>
          {failing ? (
            <div className="mt-0.5 text-xs">
              <p className="flex gap-1.5 text-hs-warning">
                <Dot tone="bad" />
                <span>{t(`${K}.folder.failing`)} {t(`${K}.offsiteErrors.${status.offsite.lastError}`, words)}</span>
              </p>
              <p className="text-hs-text-muted mt-0.5">
                {status.offsite.lastOkAt
                  ? t(`${K}.folder.lastSentRetry`, { when: when.past(status.offsite.lastOkAt) })
                  : t(`${K}.folder.retry`)}
              </p>
            </div>
          ) : (
            <p className="mt-0.5 flex gap-1.5 text-xs text-hs-text-muted">
              <Dot tone={status.offsite.lastOkAt ? 'good' : 'idle'} />
              <span className="min-w-0 break-words">
                {dest.kind === 'smb'
                  ? t(`${K}.folder.sendingToShare`, words)
                  : t(`${K}.folder.sendingTo`, words)}
                {' · '}
                {status.offsite.lastOkAt ? t(`${K}.folder.lastSent`, { when: when.past(status.offsite.lastOkAt) }) : t(`${K}.folder.notSentYet`)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3.5 shrink-0">
          <button onClick={() => void check(false)} disabled={checking} className={linkButton}>
            {checking ? t(`${K}.folder.checking`) : t(`${K}.folder.check`)}
          </button>
          <button onClick={open} className={linkButton}>{t(`${K}.folder.change`)}</button>
        </div>
      </div>
      {result && <div className="mt-2">{resultLine}</div>}
    </div>
  );
}

const KNOWN_FORM_CODES = new Set([
  'url_invalid', 'url_scheme', 'url_credentials',
  'address_invalid', 'address_no_share', 'address_credentials', 'address_bad_character',
  'kind_invalid', 'username_required', 'password_required', 'password_too_long', 'not_set_up',
]);

function LinkCard({ status, backup, when }: { status: AutoBackupStatus; backup: Backup; when: When }) {
  const t = useTranslate('editor');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const url = token ? `${window.location.origin}/api/backup/latest?token=${token}` : null;

  const make = async (replace: boolean) => {
    if (replace) {
      const ok = await useConfirmStore.getState().confirm({
        title: t(`${K}.link.newConfirm.title`),
        message: t(`${K}.link.newConfirm.message`),
        confirmLabel: t(`${K}.link.newConfirm.confirm`),
      });
      if (!ok) return;
    }
    setWorking(true);
    setToken(await backup.makeLink());
    setCopied(false);
    setWorking(false);
  };
  const show = async () => {
    setWorking(true);
    setToken(await backup.linkToken());
    setWorking(false);
  };
  const remove = async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t(`${K}.link.removeConfirm.title`),
      message: t(`${K}.link.removeConfirm.message`),
      confirmLabel: t(`${K}.link.removeConfirm.confirm`),
      variant: 'danger',
    });
    if (!ok) return;
    await backup.removeLink();
    setToken(null);
  };
  const copy = async () => {
    if (!url) return;
    setCopied(await copyText(url));
  };

  if (!status.hasLink) {
    return (
      <div className={`${cardClass} flex items-start gap-3`} data-field-id="data.autoBackupLink" data-testid="auto-backup-link">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-hs-text-primary">{t(`${K}.link.name`)}</p>
          <p className="text-xs text-hs-text-faint mt-0.5">{t(`${K}.link.description`)}</p>
        </div>
        <Button variant="secondary" onClick={() => void make(false)} disabled={working}>{t(`${K}.link.make`)}</Button>
      </div>
    );
  }

  return (
    <div className={cardClass} data-field-id="data.autoBackupLink" data-testid="auto-backup-link">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-hs-text-primary">{t(`${K}.link.name`)}</p>
          <p className="mt-0.5 flex gap-1.5 text-xs text-hs-text-muted">
            <Dot tone={status.lastPulledAt ? 'good' : 'idle'} />
            <span>{status.lastPulledAt ? t(`${K}.link.lastFetched`, { when: when.past(status.lastPulledAt) }) : t(`${K}.link.notFetched`)}</span>
          </p>
        </div>
        <button onClick={() => (url ? setToken(null) : void show())} disabled={working} className={`${linkButton} shrink-0`}>
          {url ? t(`${K}.link.hide`) : t(`${K}.link.show`)}
        </button>
      </div>
      {url && (
        <div className="mt-3 border-t border-hs-border pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              data-testid="auto-backup-link-url"
              className="min-w-0 flex-1 rounded-md bg-hs-input border border-hs-border-strong px-2.5 py-1.5 font-mono text-xs text-hs-text-body focus:outline-none"
            />
            <Button variant="secondary" onClick={() => void copy()}>{copied ? t(`${K}.link.copied`) : t(`${K}.link.copy`)}</Button>
          </div>
          <p className="text-xs text-hs-text-faint">{t(`${K}.link.warning`)}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => void make(true)} disabled={working} className={linkButton}>{t(`${K}.link.makeNew`)}</button>
            <button onClick={() => void remove()} disabled={working} className={linkButton}>{t(`${K}.link.remove`)}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CopiesList({ status, when, restoreBusy, onRestore, backup }: {
  status: AutoBackupStatus;
  when: When;
  restoreBusy: boolean;
  onRestore: (restore: AutoCopyRestore) => Promise<void>;
  backup: Backup;
}) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const [showAll, setShowAll] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const copies = showAll ? status.copies : status.copies.slice(0, COPIES_SHOWN);

  const restore = async (copy: AutoBackupCopyInfo) => {
    setWorking(copy.name);
    try {
      const summary = await backup.copySummary(copy.name);
      if (!summary) {
        await useConfirmStore.getState().alert(t(`${K}.copies.gone`));
        await backup.refresh();
        return;
      }
      const lines = [
        t(`${K}.copies.restoreConfirm.saved`, { when: when.full(copy.savedAt) }),
        t(`${K}.copies.restoreConfirm.message`),
      ];
      if (summary.pictures.count > 0) {
        lines.push(t(`${K}.copies.restoreConfirm.pictures`, { count: summary.pictures.count, size: formatIconBytes(summary.pictures.bytes, locale) }));
      }
      const ok = await useConfirmStore.getState().confirm({
        title: t(`${K}.copies.restoreConfirm.title`),
        message: lines.join('\n\n'),
        confirmLabel: t(`${K}.copies.restoreConfirm.confirm`),
        variant: 'primary',
      });
      if (!ok) return;
      await onRestore({ copy, summary, hasSavedPassword: status.hasBackupPassword });
    } finally {
      setWorking(null);
    }
  };

  const remove = async (copy: AutoBackupCopyInfo) => {
    const ok = await useConfirmStore.getState().confirm({
      title: t(`${K}.copies.removeConfirm.title`),
      message: t(`${K}.copies.removeConfirm.message`, { when: when.full(copy.savedAt) }),
      confirmLabel: t(`${K}.copies.removeConfirm.confirm`),
      variant: 'danger',
    });
    if (!ok) return;
    setWorking(copy.name);
    await backup.removeCopy(copy.name);
    setWorking(null);
  };

  return (
    <SettingsPanelPart heading={t(`${K}.copies.heading`)} data-field-id="data.autoBackupCopies">
      <div className="space-y-2">
        {status.copies.length === 0 ? (
          <p className="rounded-lg bg-hs-card border border-hs-border px-3.5 py-3 text-xs text-hs-text-faint">
            {status.nextRun ? t(`${K}.copies.emptyNext`, { when: when.next(status.nextRun) }) : t(`${K}.copies.empty`)}
          </p>
        ) : (
          <>
            {copies.map((copy) => (
              <div key={copy.name} data-testid="auto-backup-copy" className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 bg-hs-card border border-hs-border">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-hs-text-primary">
                    {when.title(copy.savedAt)}
                    {copy.withKeys && <Badge>{t(`${K}.copies.keys`)}</Badge>}
                    {copy.withPictures && <Badge>{t(`${K}.copies.pictures`)}</Badge>}
                  </p>
                  <p className="text-xs text-hs-text-muted">{formatIconBytes(copy.bytes, locale)}</p>
                  <p className="text-[11px] text-hs-text-faint font-mono truncate mt-0.5">{copy.name}</p>
                </div>
                <div className="flex items-center gap-3.5 shrink-0">
                  <a href={`/api/backup/auto/files/${encodeURIComponent(copy.name)}`} download={copy.name} className={linkButton}>
                    {t(`${K}.copies.download`)}
                  </a>
                  <button onClick={() => void restore(copy)} disabled={restoreBusy || working !== null} className={linkButton}>
                    {t(`${K}.copies.restore`)}
                  </button>
                  <button onClick={() => void remove(copy)} disabled={restoreBusy || working !== null} className={linkButton}>
                    {t(`${K}.copies.remove`)}
                  </button>
                </div>
              </div>
            ))}
            {status.copies.length > COPIES_SHOWN && (
              <button onClick={() => setShowAll(!showAll)} className={linkButton}>
                {showAll ? t(`${K}.copies.showFewer`) : t(`${K}.copies.showAll`, { count: status.copies.length })}
              </button>
            )}
          </>
        )}
      </div>
    </SettingsPanelPart>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 rounded-full border border-hs-border-strong px-1.5 text-[10.5px] text-hs-text-muted align-[1px]">
      {children}
    </span>
  );
}
