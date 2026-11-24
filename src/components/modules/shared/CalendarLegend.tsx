import type { LegendAvatar, LegendRow } from '@/lib/calendar-legend';
import { MemberBadge } from './MemberBadge';
import { WallButton } from './WallButton';

/**
 * Color key for the calendar modules, in any mode: one dot + name per
 * calendar, one avatar + name per family member, or one stack of avatars +
 * name per family group (callers build the rows with `buildLegendRows`, so a
 * calendar or person with nothing visible never appears). Em-based sizing
 * throughout — the caller sets `fontSize`, `color`, padding, and any border
 * via `style`, so the same component serves the fullscreen header row and
 * the small module's strips. Wraps to further lines rather than truncating.
 *
 * With `onOpen` (the wall, a key of calendars) the whole strip is one button
 * that opens the Calendars sheet: one finger-sized target and a "Change" pill
 * that says so, never a target per row.
 */
export function CalendarLegend({ rows, style, label, failingIds, hiddenIds, onOpen, openLabel, clipLines }: {
  rows: LegendRow[];
  style?: React.CSSProperties;
  /** Accessible name for the list ("Calendar sources"). */
  label: string;
  /** Sources whose feed is currently failing — the row's marker gets a calm amber ring. */
  failingIds?: ReadonlySet<string>;
  /**
   * Calendars this wall has hidden. A hidden one keeps its row, faded and
   * struck through: the key is how it is brought back.
   */
  hiddenIds?: ReadonlySet<string>;
  /** Opens the Calendars sheet. Absent leaves the key as plain words. */
  onOpen?: () => void;
  /** The pill's word ("Calendars", the sheet's own title); needed with `onOpen`. */
  openLabel?: string;
  /**
   * With `onOpen` on a small card: the most lines of rows to draw. The rows
   * past them are left out whole, so a line is never cut through its middle.
   */
  clipLines?: number;
}) {
  if (rows.length === 0) return null;
  const items = (
    <>
      {rows.map((row) => {
        const failing = failingIds !== undefined && row.sourceIds.some((id) => failingIds.has(id));
        const hidden = hiddenIds !== undefined && hiddenIds.size > 0 && row.sourceIds.length > 0 && row.sourceIds.every((id) => hiddenIds.has(id));
        return (
          <span
            role="listitem"
            key={`${row.kind}:${row.id}`}
            data-legend-kind={row.kind}
            data-source-failing={failing ? '' : undefined}
            data-source-hidden={hidden ? '' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45em',
              whiteSpace: 'nowrap',
              color: failing ? '#d9a441' : undefined,
              opacity: hidden ? 0.4 : undefined,
              textDecoration: hidden ? 'line-through' : undefined,
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
    </>
  );
  const layout: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '1.1em', rowGap: `${ROW_GAP_EM}em`, lineHeight: ROW_LINE };
  const clip: React.CSSProperties = clipLines
    ? { maxHeight: `${clipLines * ROW_LINE + (clipLines - 1) * ROW_GAP_EM}em`, overflow: 'hidden' }
    : {};

  if (!onOpen) {
    return <div role="list" aria-label={label} style={{ ...layout, ...style }}>{items}</div>;
  }
  return (
    <WallButton
      // A strip as wide as its card: it tints under the finger. Shrinking
      // would pull its ends, the Change pill with them, out from under a tap
      // there, and the tap would land on nothing.
      row
      data-testid="calendar-key-open"
      aria-haspopup="dialog"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.1em',
        width: '100%',
        // A finger-sized target whatever the key's own type size is.
        minHeight: 44,
        border: 0,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        ...style,
      }}
    >
      <span role="list" aria-label={label} style={{ ...layout, ...clip, flex: 1, minWidth: 0 }}>{items}</span>
      <span style={{
        flexShrink: 0,
        padding: '0.45em 1em',
        // Readable from across the room whatever the key's own type is: on a
        // card the key is small print.
        fontSize: 'max(1em, 14px)',
        borderRadius: 999,
        border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        {openLabel}
      </span>
    </WallButton>
  );
}

/** A row's line height and the gap between wrapped lines, in the key's ems. */
const ROW_LINE = 1.5;
const ROW_GAP_EM = 0.45;

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
