'use client';

import { useState } from 'react';
import { uuid } from '@/lib/uuid';
import type { ICalSource } from '@/types/config';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

const ICAL_COLOR_PALETTE = [
  '#f97316', '#a855f7', '#3b82f6', '#ef4444',
  '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
];

interface ICalFeedManagerProps {
  icalSources: ICalSource[];
  onChange: (updates: { icalSources: ICalSource[] }) => void;
}

export default function ICalFeedManager({ icalSources, onChange }: ICalFeedManagerProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedColor, setNewFeedColor] = useState(() => {
    const usedColors = new Set(icalSources.map(s => s.color));
    return ICAL_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? ICAL_COLOR_PALETTE[0];
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  function addICalSource() {
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    const newSource: ICalSource = {
      id: uuid(),
      type: 'ical',
      name: newFeedName.trim(),
      url: newFeedUrl.trim(),
      color: newFeedColor,
      enabled: true,
    };
    onChange({ icalSources: [...icalSources, newSource] });
    setNewFeedName('');
    setNewFeedUrl('');
    setShowAddForm(false);
    // Auto-pick next unused color
    const usedColors = new Set([...icalSources.map(s => s.color), newFeedColor]);
    setNewFeedColor(ICAL_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? ICAL_COLOR_PALETTE[0]);
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
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('modals.icalFeeds.title')}
      </h3>
      <div className="space-y-3">
        {icalSources.length > 0 && (
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
            {icalSources.map((source) => (
              <div key={source.id}>
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
                  <span className="text-sm text-hs-text-body truncate flex-1">
                    {source.name}
                  </span>
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
              onChange={(e) => setNewFeedUrl(e.target.value)}
              className="w-full rounded-md bg-hs-panel border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none font-mono text-xs"
              placeholder="https://example.com/calendar.ics"
            />
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
              <Button variant="primary" size="sm" onClick={addICalSource} disabled={!newFeedName.trim() || !newFeedUrl.trim()}>
                {tCore('actions.add')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setShowAddForm(false); setNewFeedName(''); setNewFeedUrl(''); }}>
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
    </section>
  );
}
