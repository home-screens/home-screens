'use client';

import { useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate, useFormattingLocale, formatRelativeTime } from '@/i18n';
import type { CalendarSourceStatus } from '@/types/config';

/**
 * Live per-source health on the settings Calendar page: one row per
 * configured source (Google calendar, iCloud calendar, ICS feed, holidays)
 * with when it last updated, and plain-language error text when it is not.
 * Reads /api/calendar/status — the latest status any display fetch already
 * computed — so opening settings never triggers an upstream calendar fetch
 * of its own. Only when nothing has been fetched this process (fresh server,
 * no display connected) does it fall back to one regular calendar fetch.
 */
export default function CalendarSourceHealth() {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const [status, setStatus] = useState<CalendarSourceStatus[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await editorFetch('/api/calendar/status', { signal: controller.signal });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.sourceStatus) && body.sourceStatus.length > 0) {
            if (!controller.signal.aborted) setStatus(body.sourceStatus);
            return;
          }
        }
        // Nothing recorded yet this process — prime it with one real fetch.
        const fallback = await editorFetch('/api/calendar', { signal: controller.signal });
        if (!fallback.ok) return;
        const body = await fallback.json();
        if (!controller.signal.aborted && Array.isArray(body.sourceStatus)) {
          setStatus(body.sourceStatus);
        }
      } catch { /* no sources configured or fetch failed — render nothing */ }
    })();
    return () => controller.abort();
  }, []);

  if (!status || status.length === 0) return null;

  const now = new Date();
  return (
    <section data-testid="calendar-source-health">
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.calendarPage.health.heading')}
      </h3>
      <div className="space-y-1.5">
        {status.map((s) => {
          const name = s.id === 'holidays' ? t('settings.calendarPage.health.holidays') : (s.name ?? s.id);
          // (from = now, to = past) yields past tense: "4 minutes ago".
          const since = s.fetchedAt != null
            ? formatRelativeTime(now, new Date(s.fetchedAt), { locale })
            : null;
          return (
            <div
              key={s.id}
              data-source-health={s.ok ? 'ok' : 'failing'}
              className="flex items-start justify-between gap-3 rounded-md bg-hs-card border border-hs-border-strong px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-hs-text-body truncate">{name}</p>
                {!s.ok && s.error && (
                  <p className="text-xs text-hs-text-faint">
                    {since
                      ? t('settings.calendarPage.health.errorSince', { error: s.error, time: since })
                      : s.error}
                  </p>
                )}
              </div>
              {s.ok ? (
                <span className="shrink-0 text-xs text-hs-text-faint">
                  {since
                    ? t('settings.calendarPage.health.updated', { time: since })
                    : t('settings.calendarPage.health.updatedNow')}
                </span>
              ) : (
                <span className="shrink-0 text-xs font-semibold text-hs-warning">
                  {t('settings.calendarPage.health.notUpdating')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
