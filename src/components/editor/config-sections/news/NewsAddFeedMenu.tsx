'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useEditorStore } from '@/stores/editor-store';
import { NEWS_CATEGORIES, NEWS_PRESETS, presetsForLocale, type NewsPreset } from '@/lib/news-presets';
import { extractYoutubeChannelId, LOCAL_SOURCE, sourceKind } from '@/lib/news/sources';
import { useTranslate } from '@/i18n';
import type { NewsFeedSource } from '@/types/config';
import { NEWS_MAX_FEEDS, presetName } from './feed-display';

type AddKind = 'preset' | 'custom' | 'local' | 'topic' | 'youtube' | 'reddit';

const ADD_KINDS: AddKind[] = ['preset', 'custom', 'local', 'topic', 'youtube', 'reddit'];

interface NewsAddFeedMenuProps {
  feeds: NewsFeedSource[];
  onAdd: (feed: Omit<NewsFeedSource, 'id'>) => void;
}

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * "Add a feed": pick a curated preset for the household's language, paste a
 * feed link, or follow one of the virtual sources (`local`, `topic:`,
 * `youtube:`, `reddit:`). Virtual sources are stored as their shorthand;
 * the server turns them into real URLs.
 */
export function NewsAddFeedMenu({ feeds, onAdd }: NewsAddFeedMenuProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const locale = useEditorStore((s) => s.config?.settings?.locale) ?? 'en-US';
  const locationName = useEditorStore((s) => s.config?.settings?.locationName) ?? '';

  const [kind, setKind] = useState<AddKind>('preset');
  const [allLanguages, setAllLanguages] = useState(false);
  const [presetId, setPresetId] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const full = feeds.length >= NEWS_MAX_FEEDS;
  const existingUrls = useMemo(() => new Set(feeds.map((f) => f.url.trim())), [feeds]);
  const hasLocal = feeds.some((f) => sourceKind(f.url) === 'local');

  const presets = useMemo(
    () => (allLanguages ? NEWS_PRESETS : presetsForLocale(locale)),
    [allLanguages, locale],
  );
  // Group by section for the household's language; by language when browsing everything.
  const groups = useMemo(() => {
    if (allLanguages) {
      const byLocale = new Map<string, NewsPreset[]>();
      for (const p of presets) byLocale.set(p.locale, [...(byLocale.get(p.locale) ?? []), p]);
      return Array.from(byLocale, ([tag, items]) => ({ label: languageName(tag), items }));
    }
    return NEWS_CATEGORIES
      .map((category) => ({
        label: t(`configSections.news.category.${category}`),
        items: presets.filter((p) => p.category === category),
      }))
      .filter((g) => g.items.length > 0);
  }, [allLanguages, presets, t]);

  const selectedPreset = presets.find((p) => p.id === presetId)
    ?? presets.find((p) => !existingUrls.has(p.url))
    ?? presets[0];

  const KIND_OPTIONS = ADD_KINDS.map((k) => ({ value: k, label: t(`configSections.news.addKind.${k}`) }));

  const changeKind = (next: AddKind) => {
    setKind(next);
    setText('');
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (full) return;
    const value = text.trim();
    switch (kind) {
      case 'preset':
        if (!selectedPreset || existingUrls.has(selectedPreset.url)) return;
        onAdd({ url: selectedPreset.url, label: selectedPreset.publisher });
        return;
      case 'custom':
        if (!isHttpUrl(value)) {
          setError(t('configSections.news.addCustomInvalid'));
          return;
        }
        onAdd({ url: value });
        break;
      case 'local':
        if (!locationName.trim() || hasLocal) return;
        onAdd({ url: LOCAL_SOURCE });
        return;
      case 'topic':
        if (!value) return;
        onAdd({ url: `topic:${value}` });
        break;
      case 'youtube': {
        const id = extractYoutubeChannelId(value);
        if (!id) {
          setError(t('configSections.news.addYoutubeInvalid'));
          return;
        }
        onAdd({ url: `youtube:${id}` });
        break;
      }
      case 'reddit': {
        const name = value.replace(/^\/?r\//i, '').replace(/\/+$/, '');
        if (!/^[A-Za-z0-9_]{2,21}$/.test(name)) {
          setError(t('configSections.news.addRedditInvalid'));
          return;
        }
        onAdd({ url: `reddit:${name}` });
        break;
      }
    }
    setText('');
    setError(null);
  };

  const textField = (label: string, placeholder: string) => (
    <div className="flex items-end gap-1">
      <LabeledField label={label} className="min-w-0 flex-1">
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder={placeholder}
          disabled={full}
          className={INPUT_CLASS}
        />
      </LabeledField>
      <Button type="submit" size="sm" disabled={full || text.trim() === ''}>{tCore('actions.add')}</Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <LabeledSelect
        label={t('configSections.news.addFeed')}
        value={kind}
        onChange={changeKind}
        options={KIND_OPTIONS}
      />

      {kind === 'preset' && (
        <>
          <div className="flex items-end gap-1">
            <LabeledField label={t('configSections.news.addPresetLabel')} className="min-w-0 flex-1">
              <select
                value={selectedPreset?.id ?? ''}
                onChange={(e) => setPresetId(e.target.value)}
                disabled={full}
                className={INPUT_CLASS}
              >
                {groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((p) => {
                      const added = existingUrls.has(p.url);
                      return (
                        <option key={p.id} value={p.id} disabled={added}>
                          {presetName(p, t)}{added ? ` ${t('configSections.news.addPresetAdded')}` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </LabeledField>
            <Button
              type="submit"
              size="sm"
              disabled={full || !selectedPreset || existingUrls.has(selectedPreset.url)}
            >
              {tCore('actions.add')}
            </Button>
          </div>
          <Toggle
            label={t('configSections.news.addAllLanguages')}
            checked={allLanguages}
            onChange={(v) => { setAllLanguages(v); setPresetId(''); }}
          />
        </>
      )}

      {kind === 'custom' && textField(t('configSections.news.addCustomLabel'), t('configSections.news.addCustomPlaceholder'))}

      {kind === 'local' && (
        <div className="space-y-1">
          <Button type="submit" size="sm" disabled={full || !locationName.trim() || hasLocal}>
            {t('configSections.news.addLocalButton')}
          </Button>
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {!locationName.trim()
              ? t('configSections.news.addLocalNoLocation')
              : hasLocal
                ? t('configSections.news.addLocalAlready')
                : t('configSections.news.addLocalHint', { place: locationName.trim() })}
          </p>
        </div>
      )}

      {kind === 'topic' && textField(t('configSections.news.addTopicLabel'), t('configSections.news.addTopicPlaceholder'))}
      {kind === 'youtube' && textField(t('configSections.news.addYoutubeLabel'), t('configSections.news.addYoutubePlaceholder'))}
      {kind === 'reddit' && textField(t('configSections.news.addRedditLabel'), t('configSections.news.addRedditPlaceholder'))}

      {error && <p role="alert" className="text-[11px] text-hs-danger leading-relaxed">{error}</p>}
    </form>
  );
}
