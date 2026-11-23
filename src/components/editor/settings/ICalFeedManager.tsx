'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { uuid } from '@/lib/uuid';
import { editorFetch } from '@/lib/editor-fetch';
import { CALENDAR_COLOR_PALETTE } from '@/lib/calendar-color';
import type { ICalCheckResult } from '@/lib/ical-calendar';
import type { CalendarSourceStatus, ICalSource } from '@/types/config';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import { SourceBlock, SourceHealthBadge, SourceHealthError, type SourceHealthMap } from './calendar-settings-bits';
import CalendarColorChoice from './CalendarColorChoice';
import { CHECKBOX_CLASS, SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import Notice from '@/components/ui/Notice';
import IconButton from '@/components/ui/IconButton';
import { useConfirmStore } from '@/stores/confirm-store';
import { buildDeleteConfirm } from '@/lib/delete-confirmations';

interface ICalFeedManagerProps {
  icalSources: ICalSource[];
  onChange: (updates: { icalSources: ICalSource[] }) => void;
  /** Per-source health keyed by ICalSource id, for the badge on each feed row. */
  health?: SourceHealthMap;
  /** Called with the outcome of the pre-save link check so the new row gets a badge at once. */
  onSourceChecked?: (status: CalendarSourceStatus) => void;
}

/** What the Add form knows about the link it is about to save. */
type LinkCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  // `message` is the localized reason; `unverified` means the check itself
  // could not run (hub offline, session gone), not that the link is bad.
  | { state: 'failed'; message: string; unverified: boolean };

export default function ICalFeedManager({ icalSources, onChange, health, onSourceChecked }: ICalFeedManagerProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedHomeNetwork, setNewFeedHomeNetwork] = useState(false);
  const [linkCheck, setLinkCheck] = useState<LinkCheck>({ state: 'idle' });
  const [newFeedColor, setNewFeedColor] = useState(() => {
    const usedColors = new Set(icalSources.map(s => s.color));
    return CALENDAR_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? CALENDAR_COLOR_PALETTE[0];
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  function closeAddForm() {
    setNewFeedName('');
    setNewFeedUrl('');
    setNewFeedHomeNetwork(false);
    setLinkCheck({ state: 'idle' });
    setShowAddForm(false);
  }

  /** Save the feed; `status` seeds its health badge when the link was checked. */
  function addICalSource(status?: CalendarSourceStatus) {
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    const newSource: ICalSource = {
      id: uuid(),
      type: 'ical',
      name: newFeedName.trim(),
      url: newFeedUrl.trim(),
      color: newFeedColor,
      enabled: true,
      ...(newFeedHomeNetwork ? { homeNetwork: true } : {}),
    };
    onChange({ icalSources: [...icalSources, newSource] });
    if (status) onSourceChecked?.({ ...status, id: newSource.id, name: newSource.name });
    closeAddForm();
    // Auto-pick next unused color
    const usedColors = new Set([...icalSources.map(s => s.color), newFeedColor]);
    setNewFeedColor(CALENDAR_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? CALENDAR_COLOR_PALETTE[0]);
  }

  /**
   * Probe the link the way the display will fetch it before saving. A bad
   * paste (a portal login page, a link missing .ics) stays in the form with
   * the reason; a link that checks out is saved with a fresh "Updated" badge.
   */
  async function checkAndAdd() {
    if (!newFeedName.trim() || !newFeedUrl.trim() || linkCheck.state === 'checking') return;
    setLinkCheck({ state: 'checking' });
    let result: ICalCheckResult;
    try {
      const res = await editorFetch('/api/calendar/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newFeedUrl.trim(), homeNetwork: newFeedHomeNetwork }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      result = await res.json();
    } catch {
      setLinkCheck({ state: 'failed', message: t('modals.icalFeeds.checkUnavailable'), unverified: true });
      return;
    }
    if (result.ok) {
      addICalSource({ id: '', ok: true, fetchedAt: Date.now() });
      return;
    }
    setLinkCheck({
      state: 'failed',
      message: t(`settings.calendarPage.health.errors.${result.messageKey}`, result.messageParams),
      unverified: false,
    });
  }

  /** A feed is something the household set up, so removing one asks first. */
  async function removeICalSource(source: ICalSource) {
    const ok = await useConfirmStore.getState().confirm(buildDeleteConfirm({
      verb: 'remove',
      name: source.name,
      consequence: t('modals.icalFeeds.removeConfirmMessage'),
      confirmLabel: t('modals.icalFeeds.removeConfirmButton'),
    }, tCore));
    if (!ok) return;
    onChange({ icalSources: icalSources.filter(s => s.id !== source.id) });
    if (editingId === source.id) setEditingId(null);
  }

  function toggleICalSource(id: string) {
    onChange({
      icalSources: icalSources.map(s =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    });
  }

  function updateICalSource(id: string, updates: Partial<ICalSource>) {
    onChange({
      icalSources: icalSources.map(s =>
        s.id === id ? { ...s, ...updates } : s
      ),
    });
  }

  return (
    <SourceBlock title={t('modals.icalFeeds.title')} testId="ical-feed-block">
      <div className="space-y-3">
        {icalSources.length > 0 && (
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
            {icalSources.map((source) => (
              <div key={source.id} data-source-row={source.id}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() => toggleICalSource(source.id)}
                    className={CHECKBOX_CLASS}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: source.color }}
                  />
                  <span className="text-sm text-hs-text-body flex-1 min-w-0">
                    <span className="block truncate">{source.name}</span>
                    {source.enabled && <SourceHealthError status={health?.get(source.id)} />}
                  </span>
                  {source.enabled && <SourceHealthBadge status={health?.get(source.id)} />}
                  <button
                    onClick={() => setEditingId(editingId === source.id ? null : source.id)}
                    className="text-xs text-hs-text-faint hover:text-hs-text-secondary transition-colors"
                  >
                    {editingId === source.id ? t('modals.icalFeeds.doneLowercase') : t('modals.icalFeeds.editLowercase')}
                  </button>
                  <IconButton label={t('modals.icalFeeds.removeFeed', { name: source.name })} onClick={() => void removeICalSource(source)} />
                </div>
                {editingId === source.id && (
                  <div className="px-3 pb-3 space-y-2">
                    <input
                      type="text"
                      value={source.name}
                      onChange={(e) => updateICalSource(source.id, { name: e.target.value })}
                      className={`w-full ${SETTINGS_INPUT_SM_CLASS}`}
                      placeholder={t('modals.icalFeeds.feedNamePlaceholder')}
                    />
                    <input
                      type="text"
                      value={source.url}
                      onChange={(e) => updateICalSource(source.id, { url: e.target.value })}
                      className={`w-full font-mono ${SETTINGS_INPUT_SM_CLASS}`}
                      placeholder="https://example.com/calendar.ics"
                    />
                    <Toggle
                      label={t('modals.icalFeeds.homeNetwork')}
                      checked={source.homeNetwork === true}
                      onChange={(v) => updateICalSource(source.id, { homeNetwork: v || undefined })}
                      description={t('modals.icalFeeds.homeNetworkHint')}
                    />
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs text-hs-text-muted">{t('fields.color')}</span>
                      <CalendarColorChoice
                        value={source.color}
                        label={t('settings.calendarPage.appearance.colorFor', { name: source.name })}
                        onChange={(color) => { if (color) updateICalSource(source.id, { color }); }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddForm ? (
          // A form, so Enter in either box adds the feed like the Add button.
          <form
            className="rounded-md bg-hs-card border border-hs-border-strong p-3 space-y-2"
            onSubmit={(e) => { e.preventDefault(); void checkAndAdd(); }}
          >
            <input
              type="text"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              className={`w-full ${SETTINGS_INPUT_SM_CLASS}`}
              placeholder={t('modals.icalFeeds.newFeedNamePlaceholder')}
              autoFocus
            />
            <input
              type="text"
              value={newFeedUrl}
              onChange={(e) => { setNewFeedUrl(e.target.value); setLinkCheck({ state: 'idle' }); }}
              className={`w-full font-mono ${SETTINGS_INPUT_SM_CLASS}`}
              placeholder="https://example.com/calendar.ics"
            />
            <Toggle
              label={t('modals.icalFeeds.homeNetwork')}
              checked={newFeedHomeNetwork}
              onChange={(v) => { setNewFeedHomeNetwork(v); setLinkCheck({ state: 'idle' }); }}
              description={t('modals.icalFeeds.homeNetworkHint')}
            />
            {linkCheck.state === 'failed' && (
              <Notice tone="warning" testId="ical-link-check" title={linkCheck.message}>
                {!linkCheck.unverified && <p>{t('modals.icalFeeds.checkFailedHint')}</p>}
              </Notice>
            )}
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-hs-text-muted">{t('fields.color')}</span>
              <CalendarColorChoice
                value={newFeedColor}
                label={t('fields.color')}
                onChange={(color) => { if (color) setNewFeedColor(color); }}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!newFeedName.trim() || !newFeedUrl.trim() || linkCheck.state === 'checking'}
              >
                {linkCheck.state === 'checking' ? t('modals.icalFeeds.checking') : tCore('actions.add')}
              </Button>
              {linkCheck.state === 'failed' && (
                <Button type="button" variant="secondary" size="sm" onClick={() => addICalSource()}>
                  {t('modals.icalFeeds.addAnyway')}
                </Button>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={closeAddForm}>
                {tCore('actions.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" className="inline-flex items-center gap-1" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('modals.icalFeeds.addFeed')}
          </Button>
        )}

        <FieldHint>
          {t('modals.icalFeeds.helpText')}
        </FieldHint>
      </div>
    </SourceBlock>
  );
}
