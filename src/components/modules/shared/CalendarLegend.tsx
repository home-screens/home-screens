import type { LegendSource } from '@/lib/calendar-utils';

/**
 * Source legend for the calendar modules: one dot + name per source that has
 * an event in the rendered window (callers build the list with
 * `legendSources`, so a configured source with nothing visible never
 * appears). Em-based sizing throughout — the caller sets `fontSize`, `color`,
 * padding, and any border via `style`, so the same component serves the
 * fullscreen header row and the small module's strips. Wraps to further
 * lines rather than truncating names.
 */
export function CalendarLegend({ sources, style, label }: {
  sources: LegendSource[];
  style?: React.CSSProperties;
  /** Accessible name for the list ("Calendar sources"). */
  label: string;
}) {
  if (sources.length === 0) return null;
  return (
    <div
      role="list"
      aria-label={label}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: '1.1em',
        rowGap: '0.45em',
        ...style,
      }}
    >
      {sources.map((s) => (
        <span
          role="listitem"
          key={s.sourceId}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', whiteSpace: 'nowrap' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '0.7em',
              height: '0.7em',
              borderRadius: '50%',
              background: s.calendarColor,
              flexShrink: 0,
            }}
          />
          {s.sourceName}
        </span>
      ))}
    </div>
  );
}
