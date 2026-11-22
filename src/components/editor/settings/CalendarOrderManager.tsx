'use client';

import { useMemo } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useSortableSensors } from '@/hooks/useDndSensors';
import { useTranslate } from '@/i18n';
import { calendarLook } from '@/lib/calendar-overrides';
import type { CalendarOverride, ICalSource, ICloudSource } from '@/types/config';
import type { GoogleCalendar } from '@/hooks/useGoogleCalendars';

/** One calendar in the order, whichever kind of source it came from. */
interface OrderRow {
  id: string;
  name: string;
  color: string;
}

/**
 * The order calendars are drawn in within a day, most wanted first.
 *
 * One flat list across every kind of source, because the order is about the
 * day's rows and a day mixes them: a Google work calendar, an iCloud family
 * one and a subscribed iCal feed all compete for the same few lines. Ordering
 * each provider separately could never say that the iCloud birthdays outrank
 * the Google bin collection, which is the whole point.
 *
 * Shows only calendars that are on: a calendar nobody sees has no row to
 * keep, and listing it would invite ordering something invisible. An entry
 * for a calendar later switched off is left in `calendarOrder` untouched, so
 * switching it back on restores its place rather than dropping it last.
 */
export default function CalendarOrderManager({
  googleCalendars, selectedIds, icalSources, icloudSources, overrides, order, onChange,
}: {
  googleCalendars: GoogleCalendar[];
  /** The Google calendars actually ticked; the rest are not drawn anywhere. */
  selectedIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  /** The household's own names and colours, so a row reads as the wall shows it. */
  overrides: Record<string, CalendarOverride> | undefined;
  /** Saved order, most wanted first; absent means none chosen. */
  order: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const t = useTranslate('editor');
  const sensors = useSortableSensors();

  // Every calendar that is on, named and coloured the way the wall shows it.
  const rows = useMemo<OrderRow[]>(() => {
    const out: OrderRow[] = [];
    for (const cal of googleCalendars) {
      if (!selectedIds.includes(cal.id)) continue;
      const look = calendarLook(cal.id, { name: cal.summary, color: cal.backgroundColor ?? '#3b82f6' }, overrides);
      out.push({ id: cal.id, name: look.name, color: look.color });
    }
    for (const source of icalSources) {
      if (source.enabled === false) continue;
      const look = calendarLook(source.id, { name: source.name, color: source.color }, overrides);
      out.push({ id: source.id, name: look.name, color: look.color });
    }
    for (const source of icloudSources) {
      if (source.enabled === false) continue;
      const look = calendarLook(source.id, { name: source.name, color: source.color }, overrides);
      out.push({ id: source.id, name: look.name, color: look.color });
    }
    return out;
  }, [googleCalendars, selectedIds, icalSources, icloudSources, overrides]);

  // Saved order first, then anything not yet ranked, in the order above.
  const ordered = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ranked = (order ?? []).map((id) => byId.get(id)).filter((row) => row !== undefined);
    const rest = rows.filter((row) => !(order ?? []).includes(row.id));
    return [...ranked, ...rest];
  }, [rows, order]);

  if (rows.length === 0) {
    return <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.ordering.empty')}</p>;
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((row) => row.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const moved = arrayMove(ids, from, to);
    // Keep ids this list cannot see (a calendar switched off, a holiday set)
    // so turning one back on puts it back where the household had it.
    const unseen = (order ?? []).filter((id) => !ids.includes(id));
    const next = [...moved, ...unseen];
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('settings.calendarPage.ordering.help')}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
            {ordered.map((row) => <OrderRowItem key={row.id} row={row} />)}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function OrderRowItem({ row }: { row: OrderRow }) {
  const t = useTranslate('editor');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      data-testid="calendar-order-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="flex items-center gap-3 px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('settings.calendarPage.appearance.reorder', { name: row.name })}
        data-testid="calendar-order-grip"
        // touch-none: without it a drag on a touchscreen scrolls the settings
        // page instead of picking the row up.
        className="shrink-0 cursor-grab touch-none text-hs-text-faint hover:text-hs-text-muted"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
      <span className="text-sm text-hs-text-body min-w-0 truncate">{row.name}</span>
    </div>
  );
}
