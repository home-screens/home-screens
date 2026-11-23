import type { LegendAvatar, LegendRow } from '@/lib/calendar-legend';
import { MemberBadge } from './MemberBadge';

/**
 * Color key for the calendar modules, in any mode: one dot + name per
 * calendar, one avatar + name per family member, or one stack of avatars +
 * name per family group (callers build the rows with `buildLegendRows`, so a
 * calendar or person with nothing visible never appears). Em-based sizing
 * throughout — the caller sets `fontSize`, `color`, padding, and any border
 * via `style`, so the same component serves the fullscreen header row and
 * the small module's strips. Wraps to further lines rather than truncating.
 */
export function CalendarLegend({ rows, style, label, failingIds }: {
  rows: LegendRow[];
  style?: React.CSSProperties;
  /** Accessible name for the list ("Calendar sources"). */
  label: string;
  /** Sources whose feed is currently failing — the row's marker gets a calm amber ring. */
  failingIds?: ReadonlySet<string>;
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
        return (
          <span
            role="listitem"
            key={`${row.kind}:${row.id}`}
            data-legend-kind={row.kind}
            data-source-failing={failing ? '' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45em',
              whiteSpace: 'nowrap',
              color: failing ? '#d9a441' : undefined,
            }}
          >
            {row.kind === 'source' ? (
              <span
                aria-hidden="true"
                style={{
                  width: '0.7em',
                  height: '0.7em',
                  borderRadius: '50%',
                  background: row.color,
                  flexShrink: 0,
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

/** The letters' size in the legend's type; the circle and its overlap are given in the badge's own ems. */
const AVATAR_LETTER_EM = 0.62;
const em = (legendEm: number) => `${legendEm / AVATAR_LETTER_EM}em`;

/** An initials circle 1.4 legend ems across; stacked ones overlap the previous by a third. */
function LegendAvatarDot({ avatar, stacked, failing }: { avatar: LegendAvatar; stacked?: boolean; failing?: boolean }) {
  return (
    <MemberBadge
      aria-hidden="true"
      initials={avatar.initials}
      color={avatar.color}
      fontSize={`${AVATAR_LETTER_EM}em`}
      size={em(1.4)}
      style={{
        marginLeft: stacked ? em(-0.45) : undefined,
        // The ring separates stacked circles from each other; the amber ring wins while a feed is failing.
        boxShadow: failing ? '0 0 0 2px rgba(217,164,65,0.75)' : stacked ? '0 0 0 2px var(--cal-legend-bg, var(--cal-bg, #0000))' : undefined,
      }}
    />
  );
}
