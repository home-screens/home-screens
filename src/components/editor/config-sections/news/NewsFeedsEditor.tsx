'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import Toggle from '@/components/ui/Toggle';
import { NESTED_INPUT_CLASS } from '@/components/ui/input-classes';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { isVirtualSource } from '@/lib/news/sources';
import type { NewsResponse } from '@/lib/news/types';
import { useTranslate } from '@/i18n';
import type { NewsFeedSource } from '@/types/config';
import { feedCheckSummary, feedDisplayName, feedKindName, NEWS_MAX_FEEDS } from './feed-display';

interface CheckState {
  status: 'checking' | 'done';
  ok?: boolean;
  text?: string;
}

interface NewsFeedsEditorProps {
  feeds: NewsFeedSource[];
  onChange: (feeds: NewsFeedSource[]) => void;
}

/**
 * The list of feeds a news module follows. Each row is collapsed to its
 * readable name until opened, so a dozen feeds still fit the property panel;
 * open rows expose the label, colour, home-network consent, per-feed cap,
 * and a "Check" that fetches the feed through `/api/news`.
 */
export function NewsFeedsEditor({ feeds, onChange }: NewsFeedsEditorProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [checks, setChecks] = useState<Record<string, CheckState>>({});

  const update = (id: string, patch: Partial<NewsFeedSource>) =>
    onChange(feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(feeds.filter((f) => f.id !== id));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= feeds.length) return;
    const next = feeds.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const check = async (feed: NewsFeedSource) => {
    setChecks((prev) => ({ ...prev, [feed.id]: { status: 'checking' } }));
    try {
      const res = await editorFetch(`/api/news?feed=${encodeURIComponent(feed.url.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NewsResponse;
      const result = data.feeds?.[0];
      const summary = result
        ? feedCheckSummary(result, feedDisplayName(feed, t), Date.now(), t)
        : { ok: false, text: t('configSections.news.feedError.failed') };
      setChecks((prev) => ({ ...prev, [feed.id]: { status: 'done', ...summary } }));
    } catch (err) {
      if (isSessionExpired(err)) return;
      setChecks((prev) => ({
        ...prev,
        [feed.id]: { status: 'done', ok: false, text: t('configSections.news.feedError.failed') },
      }));
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.news.feeds')}</span>
        <span className="text-[11px] text-hs-text-faint">{feeds.length} / {NEWS_MAX_FEEDS}</span>
      </div>

      {feeds.length === 0 && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed">{t('configSections.news.noFeeds')}</p>
      )}

      {feeds.map((feed, index) => {
        const open = openIds.has(feed.id);
        const name = feedDisplayName(feed, t);
        const kind = feedKindName(feed, t);
        const isReal = !isVirtualSource(feed.url);
        const checkState = checks[feed.id];
        return (
          <div key={feed.id} className="rounded bg-hs-card p-1.5 space-y-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleOpen(feed.id)}
                aria-expanded={open}
                aria-label={t(open ? 'configSections.news.feedCollapse' : 'configSections.news.feedExpand', { name })}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                {open
                  ? <ChevronDown className="w-3 h-3 shrink-0 text-hs-text-faint" />
                  : <ChevronRight className="w-3 h-3 shrink-0 text-hs-text-faint" />}
                <span
                  aria-hidden="true"
                  className="w-2 h-2 shrink-0 rounded-full border border-hs-border-strong"
                  style={{ backgroundColor: feed.color || 'transparent' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-hs-text-body">{name}</span>
                  {feed.label?.trim() && kind !== name && (
                    <span className="block truncate text-[10px] text-hs-text-faint">{kind}</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={t('configSections.news.feedMoveUp', { name })}
                className="p-0.5 text-hs-text-muted hover:text-hs-text-body disabled:opacity-30"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === feeds.length - 1}
                aria-label={t('configSections.news.feedMoveDown', { name })}
                className="p-0.5 text-hs-text-muted hover:text-hs-text-body disabled:opacity-30"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => remove(feed.id)}
                aria-label={t('configSections.news.feedRemove', { name })}
                className="p-0.5 text-hs-danger hover:opacity-80"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {open && (
              <div className="space-y-1.5 pl-4">
                <LabeledInput
                  label={t('configSections.news.feedLabel')}
                  value={feed.label ?? ''}
                  onChange={(v) => update(feed.id, { label: v || undefined })}
                  placeholder={t('configSections.news.feedLabelPlaceholder')}
                  className={NESTED_INPUT_CLASS}
                />
                <ColorPicker
                  label={tCore('actions.color')}
                  value={feed.color ?? ''}
                  onChange={(v) => update(feed.id, { color: v || undefined })}
                  defaultValue=""
                  resetLabel={t('common.resetToDefault')}
                />
                <LabeledInput
                  label={t('configSections.news.feedMaxItems')}
                  type="number"
                  min={1}
                  max={50}
                  value={feed.maxItems ?? ''}
                  onChange={(v) => {
                    const n = Math.floor(Number(v));
                    update(feed.id, { maxItems: Number.isFinite(n) && n > 0 ? Math.min(n, 50) : undefined });
                  }}
                  placeholder={t('configSections.news.feedMaxItemsPlaceholder')}
                  className={NESTED_INPUT_CLASS}
                />
                {isReal && (
                  <>
                    <Toggle
                      label={t('configSections.news.feedHomeNetwork')}
                      checked={feed.homeNetwork === true}
                      onChange={(v) => update(feed.id, { homeNetwork: v || undefined })}
                    />
                    <p className="text-[11px] text-hs-text-faint leading-relaxed">
                      {t('configSections.news.feedHomeNetworkHint')}
                    </p>
                  </>
                )}
                <div className="flex items-start gap-2">
                  <Button
                    size="sm"
                    onClick={() => check(feed)}
                    disabled={checkState?.status === 'checking' || feed.url.trim() === ''}
                  >
                    {checkState?.status === 'checking'
                      ? t('configSections.news.feedChecking')
                      : t('configSections.news.feedCheck')}
                  </Button>
                  {checkState?.status === 'done' && (
                    <p
                      role="status"
                      className={`min-w-0 flex-1 text-[11px] leading-relaxed ${checkState.ok ? 'text-hs-text-muted' : 'text-hs-danger'}`}
                    >
                      {checkState.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {feeds.length >= NEWS_MAX_FEEDS && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed">{t('configSections.news.feedLimitReached')}</p>
      )}
    </div>
  );
}
