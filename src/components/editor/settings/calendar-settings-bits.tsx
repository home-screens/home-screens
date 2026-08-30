'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useCalendarFetchQuery } from '../useCalendarFetchQuery';
import { useTranslate, useFormattingLocale, formatRelativeTime } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarSourceStatus } from '@/types/config';

/** Localized failure wording: the server's message key when it sent one,
 *  else its plain-English prose (older payloads, plugin sources). */
function sourceHealthMessage(status: CalendarSourceStatus, t: TranslateFn): string | undefined {
  if (status.messageKey) return t(`settings.calendarPage.health.errors.${status.messageKey}`, status.messageParams);
  return status.error;
}

/**
 * Shared pieces of the Defaults > Calendar page: the three area cards, the
 * sub-blocks inside "Where events come from", and per-source health.
 */

/**
 * One of the page's three areas, in the idiom the other Defaults pages use:
 * a small uppercase label above a neutral card, with the area's one-line
 * description as the card's first line.
 */
export function SettingsArea({ title, description, children, testId }: {
  title: string;
  description?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId}>
      <h3 className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">{title}</h3>
      <div className="rounded-lg border border-hs-border bg-hs-panel/40 px-4 py-4">
        {description && <p className="mb-4 text-[13px] text-hs-text-faint leading-relaxed">{description}</p>}
        {children}
      </div>
    </section>
  );
}

/** A source type inside "Where events come from": small uppercase title, optional right-hand slot, divider above. */
export function SourceBlock({ title, aside, right, first, children, testId }: {
  title: string;
  /** Small muted text next to the title (an account email, say). */
  aside?: ReactNode;
  /** Right-aligned slot in the title row (a Connected badge, a Disconnect link). */
  right?: ReactNode;
  first?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={first ? '' : 'mt-4 pt-4 border-t border-hs-border-strong'}>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-hs-text-secondary">{title}</h4>
        {aside && <span className="text-xs text-hs-text-faint truncate">{aside}</span>}
        {right && <span className="ml-auto flex items-center gap-3">{right}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export type SourceHealthMap = Map<string, CalendarSourceStatus>;

/**
 * Live per-source health for the page, keyed by source id (Google calendar
 * id, iCloud/iCal source id, 'holidays'). Reads /api/calendar/status, the
 * latest status any display fetch already computed, so opening settings
 * never triggers an upstream calendar fetch of its own; only when nothing
 * has been fetched this process does it fall back to one regular fetch.
 */
export function useCalendarSourceHealth(): SourceHealthMap {
  const [health, setHealth] = useState<SourceHealthMap>(() => new Map());
  // Widest window any display on the hub renders, for the cold-start fallback
  // below. Scoped to every display, not the selected one: this fetch seeds a
  // process-wide map, so it has to cover whatever the busiest grid draws.
  const calendarQuery = useCalendarFetchQuery('all');

  useEffect(() => {
    const controller = new AbortController();
    const apply = (list: CalendarSourceStatus[]) => {
      if (controller.signal.aborted) return;
      setHealth(new Map(list.map((s) => [s.id, s])));
    };
    (async () => {
      try {
        const res = await editorFetch('/api/calendar/status', { signal: controller.signal });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.sourceStatus) && body.sourceStatus.length > 0) { apply(body.sourceStatus); return; }
        }
        // Empty status = no display fetch has happened yet this process, so
        // there is nothing cached to show. Fetch once to get badges on a fresh
        // setup, using the window the displays themselves would ask for: a
        // bare fetch here would seed each source's saved-events set with an
        // upcoming-only window, and a source that failed before the first
        // display fetch would then fall back to a set holding no past days,
        // emptying every grid's past cells while its future weeks render.
        const fallback = await editorFetch(`/api/calendar${calendarQuery ? `?${calendarQuery}` : ''}`, { signal: controller.signal });
        if (!fallback.ok) return;
        const body = await fallback.json();
        if (Array.isArray(body.sourceStatus)) apply(body.sourceStatus);
      } catch { /* no sources configured or fetch failed: no badges */ }
    })();
    return () => controller.abort();
    // Re-reads health when the window changes (a display switch, a new grid
    // module). Cheap: the status GET costs nothing, and the fallback below
    // stops firing as soon as any fetch has happened this process.
  }, [calendarQuery]);

  return health;
}

/** Green "Updated 4 minutes ago" or amber "Not updating"; nothing while unknown. */
export function SourceHealthBadge({ status }: { status: CalendarSourceStatus | undefined }) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  if (!status) return null;
  const since = status.fetchedAt != null ? formatRelativeTime(new Date(), new Date(status.fetchedAt), { locale }) : null;
  if (status.ok) {
    return (
      <span data-source-health="ok" className="shrink-0 whitespace-nowrap rounded-full bg-hs-success/10 px-2 py-0.5 text-[11px] font-semibold text-hs-success">
        {since ? t('settings.calendarPage.health.updated', { time: since }) : t('settings.calendarPage.health.updatedNow')}
      </span>
    );
  }
  return (
    <span
      data-source-health="failing"
      title={sourceHealthMessage(status, t)}
      className="shrink-0 whitespace-nowrap rounded-full bg-hs-warning/10 px-2 py-0.5 text-[11px] font-semibold text-hs-warning"
    >
      {t('settings.calendarPage.health.notUpdating')}
    </span>
  );
}

/** Plain-language reason under a failing source's name. */
export function SourceHealthError({ status }: { status: CalendarSourceStatus | undefined }) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  if (!status || status.ok) return null;
  const message = sourceHealthMessage(status, t);
  if (!message) return null;
  const since = status.fetchedAt != null ? formatRelativeTime(new Date(), new Date(status.fetchedAt), { locale }) : null;
  return (
    <span className="block text-[11px] text-hs-text-faint truncate">
      {since ? t('settings.calendarPage.health.errorSince', { error: message, time: since }) : message}
    </span>
  );
}
