import type { LegendAvatar, LegendRow } from '@/lib/calendar-legend';

/**
 * Color key for the calendar modules, in any mode: one dot + name per
 * calendar, one avatar + name per family member, or one stack of avatars +
 * name per family group (callers build the rows with `buildLegendRows`, so a
 * calendar or person with nothing visible never appears). Em-based sizing
 * throughout — the caller sets `fontSize`, `color`, padding, and any border
 * via `style`, so the same component serves the fullscreen header row and
 * the small module's strips. Wraps to further lines rather than truncating.
 */
export function CalendarLegend({ rows, style, label, failingIds, mutedIds, onToggle, onPickColor, colorLabel }: {
  rows: LegendRow[];
  style?: React.CSSProperties;
  /** Accessible name for the list ("Calendar sources"). */
  label: string;
  /** Sources whose feed is currently failing — the row's marker gets a calm amber ring. */
  failingIds?: ReadonlySet<string>;
  /**
   * Rows the viewer has hidden. A muted row stays in the legend, dimmed and
   * struck through — it is the only way back, so it must never disappear
   * with its events.
   */
  mutedIds?: ReadonlySet<string>;
  /**
   * Makes rows tappable: hide or restore a calendar from the wall. Omitted
   * (the editor preview, the fullscreen header) leaves the legend inert.
   */
  onToggle?: (row: LegendRow) => void;
  /**
   * Makes the dot itself tappable: recolour that calendar from the wall. Only
   * calendar rows have a dot to tap; person and group rows take their colour
   * from the family roster, which is not this legend's to change.
   */
  onPickColor?: (row: LegendRow, rect: DOMRect) => void;
  /** Names the dot for screen readers, e.g. name => `Colour for ${name}`. Required by `onPickColor`. */
  colorLabel?: (name: string) => string;
}) {
  if (rows.length === 0) return null;
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
      {rows.map((row) => {
        const failing = failingIds !== undefined && row.sourceIds.some((id) => failingIds.has(id));
        const muted = mutedIds !== undefined && row.sourceIds.length > 0
          && row.sourceIds.every((id) => mutedIds.has(id));
        const interactive = onToggle !== undefined;
        const pickable = onPickColor !== undefined && colorLabel !== undefined && row.kind === 'source';
        return (
          <span
            role="listitem"
            key={`${row.kind}:${row.id}`}
            data-legend-kind={row.kind}
            data-source-failing={failing ? '' : undefined}
            data-source-muted={muted ? '' : undefined}
            // Tap target on the wall. A tap is not a drag, so this needs no
            // swipe opt-out; `pointerdown` tracking only classifies past the
            // 60px flick floor.
            {...(interactive
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  'aria-pressed': !muted,
                  onClick: () => onToggle(row),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(row); }
                  },
                }
              : {})}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45em',
              whiteSpace: 'nowrap',
              color: failing ? '#d9a441' : undefined,
              cursor: interactive ? 'pointer' : undefined,
              // Dimmed and struck through, not hidden: the row is the only
              // route back from a hidden calendar.
              opacity: muted ? 0.4 : undefined,
              textDecoration: muted ? 'line-through' : undefined,
            }}
          >
            {row.kind === 'source' ? (
              <span
                {...(pickable
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      'aria-label': colorLabel!(row.name),
                      // The row toggles the calendar off; the dot inside it
                      // opens the colours. Without this a tap on the dot does
                      // both and the sheet opens over a hidden calendar.
                      onClick: (e: React.MouseEvent) => {
                        e.stopPropagation();
                        onPickColor!(row, e.currentTarget.getBoundingClientRect());
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onPickColor!(row, e.currentTarget.getBoundingClientRect());
                        }
                      },
                    }
                  : { 'aria-hidden': 'true' as const })}
                style={{
                  // Bigger than it draws, so a dot under a centimetre across
                  // is still a reachable target at arm's length.
                  width: pickable ? '1.3em' : '0.7em',
                  height: pickable ? '1.3em' : '0.7em',
                  padding: pickable ? '0.3em' : undefined,
                  boxSizing: 'border-box' as const,
                  backgroundClip: pickable ? ('content-box' as const) : undefined,
                  borderRadius: '50%',
                  background: row.color,
                  flexShrink: 0,
                  cursor: pickable ? 'pointer' : undefined,
                  boxShadow: failing ? '0 0 0 2px rgba(217,164,65,0.75)' : undefined,
                }}
              />
            ) : row.kind === 'group' ? (
              <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
                {row.avatars.map((avatar, index) => (
                  <LegendAvatarDot key={avatar.name + index} avatar={avatar} stacked={index > 0} failing={failing} />
                ))}
              </span>
            ) : (
              <LegendAvatarDot avatar={row.avatar} failing={failing} />
            )}
            {row.name}
          </span>
        );
      })}
    </div>
  );
}

/** An initials circle sized off the legend font; stacked ones overlap the previous by a third. */
function LegendAvatarDot({ avatar, stacked, failing }: { avatar: LegendAvatar; stacked?: boolean; failing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1.4em',
        height: '1.4em',
        borderRadius: '50%',
        background: avatar.color,
        color: '#fff',
        fontSize: '1em',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginLeft: stacked ? '-0.45em' : undefined,
        // The ring separates stacked circles from each other; the amber ring wins while a feed is failing.
        boxShadow: failing ? '0 0 0 2px rgba(217,164,65,0.75)' : stacked ? '0 0 0 2px var(--cal-legend-bg, var(--cal-bg, #0000))' : undefined,
      }}
    >
      <span style={{ fontSize: avatar.initials.length > 2 ? '0.5em' : '0.62em', lineHeight: 1 }}>{avatar.initials}</span>
    </span>
  );
}
