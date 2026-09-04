'use client';

import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import { editorFetch } from '@/lib/editor-fetch';
import type { ICalCheckResult } from '@/lib/ical-calendar';
import type { CalendarSourceStatus, ICalSource } from '@/types/config';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import { SourceBlock, SourceHealthBadge, SourceHealthError, type SourceHealthMap } from './calendar-settings-bits';

const ICAL_COLOR_PALETTE = [
  '#f97316', '#a855f7', '#3b82f6', '#ef4444',
  '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
];

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
    return ICAL_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? ICAL_COLOR_PALETTE[0];
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
    setNewFeedColor(ICAL_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? ICAL_COLOR_PALETTE[0]);
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

  function removeICalSource(id: string) {
    onChange({ icalSources: icalSources.filter(s => s.id !== id) });
    if (editingId === id) setEditingId(null);
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
                    className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
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
                  <button
                    onClick={() => removeICalSource(source.id)}
                    className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
                  >
                    &times;
                  </button>
                </div>
                {editingId === source.id && (
                  <div className="px-3 pb-3 space-y-2">
                    <input
                      type="text"
                      value={source.name}
                      onChange={(e) => updateICalSource(source.id, { name: e.target.value })}
                      className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
                      placeholder={t('modals.icalFeeds.feedNamePlaceholder')}
                    />
                    <input
                      type="text"
                      value={source.url}
                      onChange={(e) => updateICalSource(source.id, { url: e.target.value })}
                      className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none font-mono text-xs"
                      placeholder="https://example.com/calendar.ics"
                    />
                    <Toggle
                      label={t('modals.icalFeeds.homeNetwork')}
                      checked={source.homeNetwork === true}
                      onChange={(v) => updateICalSource(source.id, { homeNetwork: v || undefined })}
                    />
                    <p className="text-[11px] text-hs-text-faint leading-relaxed">
                      {t('modals.icalFeeds.homeNetworkHint')}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-hs-text-muted mr-1">{t('fields.color')}</span>
                      {ICAL_COLOR_PALETTE.map((color) => (
                        <button
                          key={color}
                          onClick={() => updateICalSource(source.id, { color })}
                          className="w-5 h-5 rounded-full border-2 transition-colors"
                          style={{
                            backgroundColor: color,
                            borderColor: source.color === color ? '#fff' : 'transparent',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddForm ? (
          <div className="rounded-md bg-hs-card border border-hs-border-strong p-3 space-y-2">
            <input
              type="text"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
              placeholder={t('modals.icalFeeds.newFeedNamePlaceholder')}
              autoFocus
            />
            <input
              type="text"
              value={newFeedUrl}
              onChange={(e) => { setNewFeedUrl(e.target.value); setLinkCheck({ state: 'idle' }); }}
              className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none font-mono text-xs"
              placeholder="https://example.com/calendar.ics"
            />
            <Toggle
              label={t('modals.icalFeeds.homeNetwork')}
              checked={newFeedHomeNetwork}
              onChange={(v) => { setNewFeedHomeNetwork(v); setLinkCheck({ state: 'idle' }); }}
            />
            <p className="text-[11px] text-hs-text-faint leading-relaxed">
              {t('modals.icalFeeds.homeNetworkHint')}
            </p>
            {linkCheck.state === 'failed' && (
              <div data-testid="ical-link-check" className="rounded-md bg-hs-warning/10 border border-hs-warning/30 px-2.5 py-2 text-xs text-hs-warning space-y-0.5">
                <p className="font-medium">{linkCheck.message}</p>
                {!linkCheck.unverified && <p className="text-hs-warning/80">{t('modals.icalFeeds.checkFailedHint')}</p>}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-hs-text-muted mr-1">{t('fields.color')}</span>
              {ICAL_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewFeedColor(color)}
                  className="w-5 h-5 rounded-full border-2 transition-colors"
                  style={{
                    backgroundColor: color,
                    borderColor: newFeedColor === color ? '#fff' : 'transparent',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={checkAndAdd}
                disabled={!newFeedName.trim() || !newFeedUrl.trim() || linkCheck.state === 'checking'}
              >
                {linkCheck.state === 'checking' ? t('modals.icalFeeds.checking') : tCore('actions.add')}
              </Button>
              {linkCheck.state === 'failed' && (
                <Button variant="secondary" size="sm" onClick={() => addICalSource()}>
                  {t('modals.icalFeeds.addAnyway')}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={closeAddForm}>
                {tCore('actions.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
            {t('modals.icalFeeds.addFeed')}
          </Button>
        )}

        <p className="text-xs text-hs-text-faint">
          {t('modals.icalFeeds.helpText')}
        </p>
      </div>
    </SourceBlock>
  );
}
