'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { STARTER_DAY_ART } from '@/lib/starter-day-art';
import { useTranslate } from '@/i18n';

/**
 * Picture picker for day-look rules: the art that ships with Home Screens,
 * plus this household's own uploads in the media library's calendar-art
 * folder. Stores a URL in `CalendarDayRule.backgroundImage`.
 */

const KEY = 'configSections.calendarRules';
const CALENDAR_ART_DIR = 'calendar-art';

export default function DayArtPicker({ value, onChange }: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const t = useTranslate('editor');
  const [tab, setTab] = useState<'builtin' | 'yours'>(value && !value.startsWith('/starter-day-art/') ? 'yours' : 'builtin');
  const [yours, setYours] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadYours = useCallback(async () => {
    try {
      const res = await editorFetch(`/api/backgrounds?directory=${encodeURIComponent(CALENDAR_ART_DIR)}`);
      if (res.ok) setYours(await res.json());
    } catch {
      // A failed listing just leaves the tab empty; upload still works.
    }
  }, []);

  useEffect(() => { void loadYours(); }, [loadYours]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('directory', CALENDAR_ART_DIR);
      formData.append('file', file);
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t(`${KEY}.artUploadFailed`));
        return;
      }
      const { path } = (await res.json()) as { path: string };
      onChange(path);
      setTab('yours');
      await loadYours();
    } catch {
      setError(t(`${KEY}.artUploadFailed`));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (url: string) => {
    const file = new URL(url, 'http://localhost').searchParams.get('file');
    if (!file) return;
    const res = await editorFetch('/api/backgrounds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, directory: CALENDAR_ART_DIR }),
    });
    if (res.ok) {
      setYours((prev) => prev.filter((u) => u !== url));
      if (value === url) onChange(undefined);
    }
  };

  const tabClass = (on: boolean) =>
    `flex-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${on ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body' : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hs-border-strong/60 p-2" data-day-art-picker="">
      <div className="flex gap-1">
        <button type="button" aria-pressed={tab === 'builtin'} onClick={() => setTab('builtin')} className={tabClass(tab === 'builtin')}>
          {t(`${KEY}.artTabBuiltin`)}
        </button>
        <button type="button" aria-pressed={tab === 'yours'} onClick={() => setTab('yours')} className={tabClass(tab === 'yours')}>
          {t(`${KEY}.artTabYours`)}
        </button>
      </div>

      {tab === 'builtin' && (
        <div className="grid grid-cols-3 gap-1.5">
          {STARTER_DAY_ART.map((art) => (
            <button
              key={art.id}
              type="button"
              aria-label={t(`${KEY}.artNames.${art.id}`)}
              aria-pressed={value === art.path}
              onClick={() => onChange(art.path)}
              className={`overflow-hidden rounded border ${value === art.path ? 'border-hs-accent' : 'border-hs-border-strong hover:border-hs-text-faint'}`}
              data-art-option={art.id}
            >
              <span className="block h-10 bg-cover bg-center" style={{ backgroundImage: `url(${art.path})` }} />
              <span className="block truncate px-0.5 py-0.5 text-[10px] text-hs-text-muted">{t(`${KEY}.artNames.${art.id}`)}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'yours' && (
        <div className="flex flex-col gap-1.5">
          {yours.map((url) => (
            <div key={url} className="flex items-center gap-1 rounded border border-hs-border-strong px-1.5 py-1" data-my-art="">
              <button
                type="button"
                aria-pressed={value === url}
                onClick={() => onChange(url)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="h-8 w-11 flex-none rounded bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
                <span className="truncate text-[11px] text-hs-text-muted">
                  {decodeURIComponent(url.split('file=')[1] ?? '')}
                </span>
              </button>
              <button type="button" aria-label={t(`${KEY}.artDelete`)} onClick={() => void remove(url)} className="px-1 text-xs text-hs-text-muted hover:text-hs-danger">✕</button>
            </div>
          ))}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded border border-dashed border-hs-border-strong py-1.5 text-[11px] text-hs-text-muted hover:text-hs-text-body disabled:opacity-50"
            data-upload-art=""
          >
            {uploading ? t(`${KEY}.artUploading`) : t(`${KEY}.artUpload`)}
          </button>
          <span className="text-[10px] text-hs-text-faint">{t(`${KEY}.artUploadHint`)}</span>
          {error && <span className="text-[11px] text-hs-warning">{error}</span>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
