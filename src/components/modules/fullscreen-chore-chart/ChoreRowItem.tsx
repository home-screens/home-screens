'use client';

import type { ChoreMember } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import AssigneeDot from './AssigneeDot';
import { dotGap, TOD_ICONS, type ChoreRow, type ToggleParams } from './helpers';

interface ChoreRowItemProps {
  row: ChoreRow;
  /** Chore-name size. Everything else on the row is a fraction of it. */
  fontSize: number;
  /** Dot size for this column; the same on every row of the column. */
  dotSize: number;
  /**
   * Row height from the fit rule. A flat row is exactly this tall; a stacked
   * row is at least this tall and grows for a second name line.
   */
  rowHeight?: number;
  /**
   * Dots on their own line under the name. Decided per column, so every row
   * in a column has the same shape (see `shouldStack`).
   */
  stacked?: boolean;
  /** Width the row has to work with, for the name-fit estimate. */
  rowWidth?: number;
  /**
   * Draw the initial inside a to-do dot. Off in the by-person layout, where
   * every dot in a section belongs to the section's own member.
   */
  showInitials?: boolean;
  /** Draw the time-of-day glyph after the name (the by-person layout has no bands). */
  showTimeOfDay?: boolean;
  isFirst: boolean;
  showPoints: boolean;
  memberMap: Map<string, ChoreMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

/**
 * Inter glyph width at weight 500 as a fraction of the font size, erring
 * wide: a name the estimate says fits must really fit, or it ellipsises.
 */
const GLYPH_EM = 0.6;
/** A name never shrinks past this fraction of the authored size. */
const MIN_NAME_FRACTION = 0.85;
const LINE_HEIGHT = 1.15;

/** Estimated width of `text` at `fontSize`. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * GLYPH_EM * fontSize;
}

/**
 * The largest size, up to `fontSize`, at which a one-line name fits in
 * `available`. Estimated from glyph counts rather than measured: a
 * measurement pass per row per resize is not worth it for a wall chart, and
 * the estimate errs wide, so a fitted name still ellipsises cleanly.
 */
export function fitNameSize(fontSize: number, name: string, available: number): number {
  if (available <= 0) return fontSize * MIN_NAME_FRACTION;
  const fitted = available / (name.length * GLYPH_EM);
  return Math.max(fontSize * MIN_NAME_FRACTION, Math.min(fontSize, fitted));
}

export default function ChoreRowItem({
  row,
  fontSize,
  dotSize,
  rowHeight,
  stacked = false,
  rowWidth,
  showInitials = true,
  showTimeOfDay = false,
  isFirst,
  showPoints,
  memberMap,
  initialsMap,
  allowTouch,
  onToggle,
}: ChoreRowItemProps) {
  const t = useTranslate('modules');
  const ticketLabel = showPoints && row.points > 1
    ? t(row.points === 1 ? 'fullscreen-chore-chart.ticketCount' : 'fullscreen-chore-chart.ticketsCount', { count: row.points })
    : '';
  const hasIcon = !!row.choreEmoji;
  const iconSize = fontSize * 0.9;
  const gap = fontSize * 0.5;
  const padX = fontSize * 0.3;
  const dotCount = row.assignees.length;
  const dotsWidth = dotCount * dotSize + (dotCount - 1) * dotGap(dotSize);
  const tagSize = fontSize * 0.62;
  const tagWidth = ticketLabel ? textWidth(ticketLabel, tagSize) + gap : 0;
  const todWidth = showTimeOfDay ? fontSize * 0.8 + gap : 0;

  // What the name line has left once the icon, the tag, the glyph and (on a
  // flat row) the dots have taken their share. When that is under about nine
  // characters the extras give way before the name does: the time glyph
  // first, then the ticket tag.
  const roomFor = (withTag: boolean, withTod: boolean) => {
    if (!rowWidth) return 0;
    const line = rowWidth - padX * 2 - (hasIcon ? iconSize + gap : 0) - (withTag ? tagWidth : 0) - (withTod ? todWidth : 0);
    return stacked ? line : line - (dotCount > 0 ? dotsWidth + gap : 0);
  };
  const minRoom = fontSize * GLYPH_EM * 9;
  let showTod = showTimeOfDay;
  let showTag = !!ticketLabel;
  if (rowWidth && roomFor(showTag, showTod) < minRoom && showTod) showTod = false;
  if (rowWidth && roomFor(showTag, showTod) < minRoom && showTag) showTag = false;
  const nameRoom = roomFor(showTag, showTod);
  const fits = nameRoom <= 0 || textWidth(row.choreName, fontSize) <= nameRoom;
  // A row tall enough for two lines wraps a long name before it shrinks it;
  // a stacked row grows for the second line instead. A single word cannot
  // wrap, so it shrinks.
  const canWrap = /\s/.test(row.choreName.trim());
  const twoLinesFit = stacked || rowHeight === undefined || rowHeight >= fontSize * LINE_HEIGHT * 2 + fontSize * 0.4;
  const maxLines = fits ? 1 : twoLinesFit && canWrap ? 2 : 1;
  // A wrapped name still shrinks when its longest word alone would overflow
  // the line, so "dishwasher" is never cut in half.
  const longestWord = row.choreName.split(/\s+/).reduce((n, w) => Math.max(n, w.length), 0);
  const nameSize = fits
    ? fontSize
    : maxLines === 2
      ? Math.max(fontSize * 0.7, Math.min(fontSize, nameRoom / (longestWord * GLYPH_EM)))
      : fitNameSize(fontSize, row.choreName, nameRoom);

  const name = (
    <span
      style={{
        flex: 1,
        fontSize: nameSize,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--fcc-text)',
        minWidth: 0,
        overflow: 'hidden',
        lineHeight: LINE_HEIGHT,
        ...(maxLines > 1
          ? { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical' as const, whiteSpace: 'normal' as const }
          : { whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' }),
      }}
    >
      {row.choreName}
    </span>
  );
  const tag = showTag && (
    <span style={{ fontSize: tagSize, color: 'var(--fcc-text-2)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {ticketLabel}
    </span>
  );
  const TodIcon = TOD_ICONS[row.timeOfDay];
  const tod = showTod && (
    <TodIcon size={fontSize * 0.8} color="var(--fcc-text-3)" strokeWidth={2} style={{ flexShrink: 0 }} />
  );
  const icon = hasIcon && (
    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--fcc-text-2)' }}>
      <ChoreIcon value={row.choreEmoji} size={iconSize} color="var(--fcc-text-2)" bare />
    </span>
  );
  const dots = (
    <div style={{ display: 'flex', alignItems: 'center', gap: dotGap(dotSize), flexShrink: 0 }}>
      {row.assignees.map((a) => {
        const member = memberMap.get(a.memberId);
        if (!member) return null;
        return (
          <AssigneeDot
            key={a.memberId}
            memberId={a.memberId}
            isCompleted={a.isCompleted}
            dotSize={dotSize}
            choreId={row.choreId}
            choreName={row.choreName}
            memberName={member.name}
            memberColor={member.color}
            initial={showInitials ? (initialsMap.get(a.memberId) ?? member.name[0]) : ''}
            allowTouch={allowTouch}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );

  if (stacked) {
    return (
      <div
        data-testid="fcc-row"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `${fontSize * 0.4}px ${padX}px`,
          minHeight: rowHeight,
          boxSizing: 'border-box',
          flexShrink: 0,
          gap: fontSize * 0.35,
          borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap, minWidth: 0 }}>
          {icon}
          {name}
          {tod}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap, paddingLeft: hasIcon ? iconSize + gap : 0 }}>
          {dots}
          <span style={{ flex: 1 }} />
          {tag}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="fcc-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: rowHeight === undefined ? `${fontSize * 0.4}px ${padX}px` : `0 ${padX}px`,
        height: rowHeight,
        boxSizing: 'border-box',
        flexShrink: 0,
        gap,
        borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
      }}
    >
      {icon}
      {name}
      {tag}
      {tod}
      {dots}
    </div>
  );
}
