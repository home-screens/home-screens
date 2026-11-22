'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { icloudSourceId } from '@/lib/icloud-source-id';
import { editorFetch } from '@/lib/editor-fetch';
import type { CalendarOverride, ICloudSource } from '@/types/config';
import type { ICloudCalendarListing } from '@/lib/caldav-calendar';
import { calendarLook, storedOverride } from '@/lib/calendar-overrides';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import { SourceBlock, SourceHealthBadge, SourceHealthError, type SourceHealthMap } from './calendar-settings-bits';
import { CalendarLookButton, CalendarLookStrip } from './CalendarLookEditor';
import { logger } from '@/lib/logger';

const log = logger('ICloudCalendarManager');

const ICLOUD_FALLBACK_PALETTE = [
  '#f97316', '#a855f7', '#3b82f6', '#ef4444',
  '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
];

interface ICloudAccountInfo {
  id: string;
  appleId: string;
}

type AccountCalendars =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; calendars: ICloudCalendarListing[]; birthdaysAvailable: boolean };

interface ICloudCalendarManagerProps {
  icloudSources: ICloudSource[];
  onChange: (updates: { icloudSources: ICloudSource[] }) => void;
  /** Per-source health keyed by ICloudSource id, for the badge on each picked calendar. */
  health?: SourceHealthMap;
  /** The household's own names and colours, keyed by ICloudSource id. */
  calendarOverrides?: Record<string, CalendarOverride>;
  /** Which calendar's name and colour strip is open, shared with the Google rows. */
  editingLookId?: string | null;
  /** The first account's list carries the "names and colours" search anchor while no strip is open. */
  searchAnchor?: boolean;
  onEditLook?: (id: string | null) => void;
  onLookChange?: (id: string, patch: CalendarOverride) => void;
}

export default function ICloudCalendarManager({
  icloudSources, onChange, health, calendarOverrides, editingLookId = null, searchAnchor = false, onEditLook, onLookChange,
}: ICloudCalendarManagerProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [accounts, setAccounts] = useState<ICloudAccountInfo[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [calendarsByAccount, setCalendarsByAccount] = useState<Record<string, AccountCalendars>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAppleId, setNewAppleId] = useState('');
  const [newAppPassword, setNewAppPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [disconnectFailedId, setDisconnectFailedId] = useState<string | null>(null);
  const sourcesRef = useRef(icloudSources);
  sourcesRef.current = icloudSources;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  /** A calendar's id, the same each time it is ticked (`icloudSourceId`). */
  const idFor = useCallback((accountId: string, kind: ICloudSource['kind'], url: string) => {
    const appleId = accountsRef.current.find((a) => a.id === accountId)?.appleId ?? accountId;
    return icloudSourceId(appleId, kind, url);
  }, []);

  const fetchAccountCalendars = useCallback(async (accountId: string) => {
    setCalendarsByAccount((prev) => ({ ...prev, [accountId]: { status: 'loading' } }));
    try {
      const res = await editorFetch(`/api/icloud/calendars?account=${encodeURIComponent(accountId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCalendarsByAccount((prev) => ({
        ...prev,
        [accountId]: { status: 'ready', calendars: data.calendars ?? [], birthdaysAvailable: !!data.birthdaysAvailable },
      }));
    } catch (err) {
      log.debug('fetchAccountCalendars failed:', err);
      setCalendarsByAccount((prev) => ({ ...prev, [accountId]: { status: 'error' } }));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadAccounts() {
      try {
        const res = await editorFetch('/api/icloud/accounts');
        if (!res.ok) return;
        const list: ICloudAccountInfo[] = await res.json();
        if (cancelled) return;
        setAccounts(list);
        for (const account of list) fetchAccountCalendars(account.id);
      } catch (err) {
        log.debug('loadAccounts failed:', err);
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    }
    loadAccounts();
    return () => { cancelled = true; };
  }, [fetchAccountCalendars]);

  const connectAccount = useCallback(async () => {
    const appleId = newAppleId.trim();
    const appPassword = newAppPassword.trim();
    if (!appleId || !appPassword) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await editorFetch('/api/icloud/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appleId, appPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setConnectError(data?.error ?? t('settings.calendarPage.icloud.connectFailed'));
        return;
      }
      setAccounts((prev) => [...prev.filter((a) => a.id !== data.id), data]);
      setNewAppleId('');
      setNewAppPassword('');
      setShowAddForm(false);
      fetchAccountCalendars(data.id);
    } catch (err) {
      log.debug('connectAccount failed:', err);
      setConnectError(t('settings.calendarPage.icloud.connectFailed'));
    } finally {
      setConnecting(false);
    }
  }, [newAppleId, newAppPassword, fetchAccountCalendars, t]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    setDisconnectFailedId(null);
    // Only forget the account (and strip its sources from config) once the
    // server confirms the credentials are gone — otherwise a failed request
    // silently drops sources while the credentials stay on disk.
    try {
      const res = await editorFetch('/api/icloud/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      log.debug('disconnectAccount failed:', err);
      setDisconnectFailedId(accountId);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    setCalendarsByAccount((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    onChange({ icloudSources: sourcesRef.current.filter((s) => s.accountId !== accountId) });
  }, [onChange]);

  const nextColor = useCallback((appleColor: string | null) => {
    if (appleColor) return appleColor;
    const used = new Set(sourcesRef.current.map((s) => s.color));
    return ICLOUD_FALLBACK_PALETTE.find((c) => !used.has(c)) ?? ICLOUD_FALLBACK_PALETTE[0];
  }, []);

  const toggleCalendar = useCallback((accountId: string, cal: ICloudCalendarListing) => {
    const sources = sourcesRef.current;
    const existing = sources.find((s) => s.accountId === accountId && s.kind === 'calendar' && s.url === cal.url);
    if (existing) {
      onChange({ icloudSources: sources.filter((s) => s.id !== existing.id) });
    } else {
      const source: ICloudSource = {
        id: idFor(accountId, 'calendar', cal.url),
        accountId,
        kind: 'calendar',
        url: cal.url,
        name: cal.name,
        color: nextColor(cal.color),
        enabled: true,
      };
      onChange({ icloudSources: [...sources, source] });
    }
  }, [onChange, nextColor, idFor]);

  const toggleBirthdays = useCallback((accountId: string) => {
    const sources = sourcesRef.current;
    const existing = sources.find((s) => s.accountId === accountId && s.kind === 'birthdays');
    if (existing) {
      onChange({ icloudSources: sources.filter((s) => s.id !== existing.id) });
    } else {
      const source: ICloudSource = {
        id: idFor(accountId, 'birthdays', ''),
        accountId,
        kind: 'birthdays',
        url: '',
        name: t('settings.calendarPage.icloud.birthdays'),
        color: nextColor(null),
        enabled: true,
      };
      onChange({ icloudSources: [...sources, source] });
    }
  }, [onChange, nextColor, idFor, t]);

  const sourceFor = (accountId: string, kind: ICloudSource['kind'], url: string) =>
    icloudSources.find((s) => s.accountId === accountId && s.kind === kind && (kind === 'birthdays' || s.url === url));

  /**
   * One calendar in an account's list: the checkbox, dot and name in one
   * label, then, once it is ticked (`source`), its health and the pencil for
   * its name and colour. The pencil sits outside the label so a click on it
   * never unticks the calendar.
   */
  const pickRow = (opts: {
    key: string;
    onToggle: () => void;
    name: string;
    color: string | undefined;
    source: ICloudSource | undefined;
  }) => {
    const { source } = opts;
    const editing = source !== undefined && editingLookId === source.id;
    return (
      <div key={opts.key} data-testid="icloud-calendar-row">
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-hs-hover">
          <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={source !== undefined}
              onChange={opts.onToggle}
              className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
            />
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0${opts.color ? '' : ' bg-hs-text-faint'}`}
              style={opts.color ? { backgroundColor: opts.color } : undefined}
            />
            <span className="text-sm text-hs-text-body flex-1 min-w-0">
              <span className="block truncate">{opts.name}</span>
              {source && <SourceHealthError status={health?.get(source.id)} />}
            </span>
          </label>
          {source && <SourceHealthBadge status={health?.get(source.id)} />}
          {source && onEditLook && (
            <CalendarLookButton
              name={opts.name}
              open={editing}
              onToggle={() => onEditLook(editing ? null : source.id)}
            />
          )}
        </div>
        {editing && onEditLook && onLookChange && (
          <CalendarLookStrip
            own={{ name: source.name, color: source.color }}
            override={storedOverride(calendarOverrides, source.id)}
            onChange={(patch) => onLookChange(source.id, patch)}
            onDone={() => onEditLook(null)}
          />
        )}
      </div>
    );
  };

  return (
    <SourceBlock title={t('settings.calendarPage.icloud.heading')} testId="icloud-calendar-block">
      <div className="space-y-3">
        {accountsLoading ? (
          <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.icloud.checkingAccounts')}</p>
        ) : (
          accounts.map((account, accountIndex) => {
            const cals = calendarsByAccount[account.id];
            const accountSources = icloudSources.filter((s) => s.accountId === account.id);
            return (
              <div key={account.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-hs-success flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
                    {account.appleId}
                  </span>
                  <button
                    onClick={() => disconnectAccount(account.id)}
                    className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
                  >
                    {t('settings.calendarPage.icloud.disconnect')}
                  </button>
                </div>
                {disconnectFailedId === account.id && (
                  <p className="text-xs text-hs-warning">{t('settings.calendarPage.icloud.disconnectFailed')}</p>
                )}
                {!cals || cals.status === 'loading' ? (
                  <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.icloud.loadingCalendars')}</p>
                ) : cals.status === 'error' ? (
                  // A failed listing (expired app password, iCloud down) is
                  // exactly when per-source health matters most: the picked
                  // calendars still exist in config, so show each with its
                  // cached status instead of only a generic error line.
                  <div className="space-y-2">
                    <p className="text-xs text-hs-warning">{t('settings.calendarPage.icloud.calendarsError')}</p>
                    {accountSources.length > 0 && (
                      <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
                        {accountSources.map((s) => {
                          const look = calendarLook(s.id, { name: s.name, color: s.color }, calendarOverrides);
                          return (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: look.color }} />
                            <span className="text-sm text-hs-text-body flex-1 min-w-0">
                              <span className="block truncate">{look.name}</span>
                              <SourceHealthError status={health?.get(s.id)} />
                            </span>
                            <SourceHealthBadge status={health?.get(s.id)} />
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : cals.calendars.length === 0 && !cals.birthdaysAvailable ? (
                  <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.icloud.noCalendars')}</p>
                ) : (
                  <div className="space-y-1">
                    <span className="text-xs text-hs-text-muted">{t('settings.calendarPage.icloud.selectCalendars')}</span>
                    <div
                      className="max-h-40 overflow-y-auto rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong"
                      data-field-id={searchAnchor && accountIndex === 0 && editingLookId === null ? 'calendar.calendarOverrides' : undefined}
                    >
                      {cals.calendars.map((cal) => {
                        const source = sourceFor(account.id, 'calendar', cal.url);
                        // Ticked, the saved name, which is what the wall, the
                        // pickers and Reset use; unticked, Apple's current one.
                        const look = source
                          ? calendarLook(source.id, { name: source.name, color: source.color }, calendarOverrides)
                          : { name: cal.name, color: cal.color ?? '#3b82f6' };
                        return pickRow({
                          key: cal.url,
                          onToggle: () => toggleCalendar(account.id, cal),
                          name: look.name,
                          color: look.color,
                          source,
                        });
                      })}
                      {cals.birthdaysAvailable && (() => {
                        const source = sourceFor(account.id, 'birthdays', '');
                        const look = source ? calendarLook(source.id, { name: source.name, color: source.color }, calendarOverrides) : null;
                        return pickRow({
                          key: 'birthdays',
                          onToggle: () => toggleBirthdays(account.id),
                          name: look?.name ?? t('settings.calendarPage.icloud.birthdays'),
                          // Unticked, the dot stays plain: the colour is only picked on ticking.
                          color: look?.color,
                          source,
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {showAddForm ? (
          <div className="rounded-md bg-hs-card border border-hs-border-strong p-3 space-y-2">
            <input
              type="text"
              value={newAppleId}
              onChange={(e) => setNewAppleId(e.target.value)}
              className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
              placeholder={t('settings.calendarPage.icloud.appleIdPlaceholder')}
              autoComplete="off"
              autoFocus
            />
            <input
              type="password"
              value={newAppPassword}
              onChange={(e) => setNewAppPassword(e.target.value)}
              className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none font-mono text-xs"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="new-password"
            />
            {connectError && <p className="text-xs text-hs-danger">{connectError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={connectAccount}
                disabled={connecting || !newAppleId.trim() || !newAppPassword.trim()}
              >
                {connecting
                  ? t('settings.calendarPage.icloud.connecting')
                  : t('settings.calendarPage.icloud.connect')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowAddForm(false); setNewAppleId(''); setNewAppPassword(''); setConnectError(null); }}
              >
                {tCore('actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          !accountsLoading && (
            <Button variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
              {t('settings.calendarPage.icloud.addAccount')}
            </Button>
          )
        )}

        <p className="text-xs text-hs-text-faint">
          {t('settings.calendarPage.icloud.helpText')}
        </p>
      </div>
    </SourceBlock>
  );
}
