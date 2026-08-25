import type { LegendSource } from '@/lib/calendar-legend';

/**
 * Source legend for the calendar modules: one dot + name per source that has
 * an event in the rendered window (callers build the list with
 * `legendSources`, so a configured source with nothing visible never
 * appears). Em-based sizing throughout — the caller sets `fontSize`, `color`,
 * padding, and any border via `style`, so the same component serves the
 * fullscreen header row and the small module's strips. Wraps to further
 * lines rather than truncating names.
 */
export function CalendarLegend({ sources, style, label, failingIds }: {
  sources: LegendSource[];
  style?: React.CSSProperties;
  /** Accessible name for the list ("Calendar sources"). */
  label: string;
  /** Sources whose feed is currently failing — dot gets a calm amber ring. */
  failingIds?: ReadonlySet<string>;
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
      {sources.map((s) => {
        const failing = failingIds?.has(s.sourceId) === true;
        return (
          <span
            role="listitem"
            key={s.sourceId}
            data-source-failing={failing ? '' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45em',
              whiteSpace: 'nowrap',
              color: failing ? '#d9a441' : undefined,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '0.7em',
                height: '0.7em',
                borderRadius: '50%',
                background: s.calendarColor,
                flexShrink: 0,
                boxShadow: failing ? '0 0 0 2px rgba(217,164,65,0.75)' : undefined,
              }}
            />
            {s.sourceName}
          </span>
        );
      })}
    </div>
  );
}
