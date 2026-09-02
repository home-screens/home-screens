'use client';

import type { ChoreMember } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import AssigneeDot, { dotSlotWidth } from './AssigneeDot';
import type { ChoreRow, ToggleParams } from './helpers';

interface ChoreRowItemProps {
  row: ChoreRow;
  fontSize: number;
  dotSize: number;
  /**
   * Fixed row height from the fit rule (see FullscreenChoreChartModule).
   * Omitted = the row is as tall as its padded content, the pre-fit layout.
   */
  rowHeight?: number;
  /**
   * Narrow column (landscape). The name may wrap to a second line, and a
   * row with several dots puts them on their own line under the name; a
   * row with one dot keeps it beside the name, where a lone ring belongs.
   */
  stacked?: boolean;
  /**
   * Width the row has to work with. A long name shrinks (never below 78% of
   * `fontSize`) until it fits beside its dots before it ellipsises, so a
   * light day with 80px rows does not read "Make your ..." across the room.
   */
  rowWidth?: number;
  /**
   * Print each assignee's name under their dot. Zero (the default) draws bare
   * dots; the module passes a size once the fitted row is tall enough to
   * hold a name line beneath the dot.
   */
  nameLabelSize?: number;
  /**
   * Draw the initial inside an unfinished dot. Off in the by-person layout,
   * where every dot in a section belongs to the section's own member.
   */
  showInitials?: boolean;
  isFirst: boolean;
  showPoints: boolean;
  memberMap: Map<string, ChoreMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

/** Average Inter glyph width at weight 500, as a fraction of the font size. */
const GLYPH_EM = 0.54;
/** A name never shrinks past this fraction of the fitted row size. */
const MIN_NAME_FRACTION = 0.78;

/**
 * The largest size, up to `fontSize`, at which the name and its ticket tag
 * fit in the width left beside the icon and dots. Estimated from glyph
 * counts rather than measured: a measurement pass per row per resize is not
 * worth it for a wall chart, and the estimate errs wide, so a fitted name
 * still ellipsises cleanly instead of overflowing.
 */
export function fitNameSize(
  fontSize: number,
  name: string,
  ticketLabel: string,
  rowWidth: number | undefined,
  dotCount: number,
  dotSize: number,
  hasIcon: boolean,
  /** Width of one dot column when names are printed under the dots. */
  dotSlot: number = dotSize,
): number {
  if (!rowWidth || rowWidth <= 0) return fontSize;
  const dotsWidth = dotCount > 0 ? dotCount * dotSlot + (dotCount - 1) * dotGap(dotSize) + fontSize * 0.6 : 0;
  const iconWidth = hasIcon ? fontSize * 0.8 + fontSize * 0.6 : 0;
  const available = rowWidth - fontSize * 0.6 - dotsWidth - iconWidth;
  if (available <= 0) return fontSize * MIN_NAME_FRACTION;
  // The ticket tag is 60% of the name size plus its gap.
  const ems = name.length * GLYPH_EM + (ticketLabel ? ticketLabel.length * GLYPH_EM * 0.6 + 0.3 : 0);
  const fitted = available / ems;
  return Math.max(fontSize * MIN_NAME_FRACTION, Math.min(fontSize, fitted));
}

/** Gap between two dots on a row. */
export function dotGap(dotSize: number): number {
  return Math.max(dotSize * 0.2, 8);
}

/** Smallest dot still readable as a ring with a letter in it. */
const MIN_STACKED_DOT = 28;

/**
 * The largest dot, up to `dotSize`, at which `count` dots fit on their own
 * line in a `rowWidth`-wide stacked row. Undefined width (a row that is not
 * stacked, or not measured) keeps the requested size.
 */
export function fitStackedDots(dotSize: number, count: number, rowWidth: number | undefined, fontSize: number, hasIcon: boolean): number {
  if (!rowWidth || rowWidth <= 0 || count <= 0) return dotSize;
  const room = rowWidth - fontSize * 0.6 - (hasIcon ? fontSize * 1.2 : 0);
  // Gaps scale with the dot, so solve count*d + (count-1)*max(0.2d, 8) <= room
  // by trying the proportional gap first and the 8px floor second.
  const proportional = room / (count + (count - 1) * 0.2);
  const fitted = proportional * 0.2 >= 8 ? proportional : (room - (count - 1) * 8) / count;
  return Math.max(MIN_STACKED_DOT, Math.min(dotSize, fitted));
}

export default function ChoreRowItem({
  row,
  fontSize,
  dotSize: requestedDotSize,
  rowHeight,
  stacked = false,
  rowWidth,
  nameLabelSize = 0,
  showInitials = true,
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
  const labelled = nameLabelSize > 0;
  // One dot sits beside the name even in a narrow column; several go under it.
  const dotsBelow = stacked && row.assignees.length > 1;
  // Dots on their own line: nothing else gives way when five of them outgrow
  // a narrow landscape column, so the dots do.
  const dotSize = fitStackedDots(requestedDotSize, row.assignees.length, dotsBelow ? rowWidth : undefined, fontSize, !!row.choreEmoji);
  const dotSlot = labelled ? dotSlotWidth(dotSize, nameLabelSize) : dotSize;
  // A narrow column wraps the name onto a second line when the row is tall
  // enough for one, instead of shrinking it or cutting it to three words.
  const lineHeight = 1.1;
  const nameRoom = rowHeight === undefined ? Infinity : dotsBelow ? rowHeight - dotSize - fontSize * 0.25 : rowHeight - fontSize * 0.3;
  const maxLines = stacked ? Math.min(2, Math.max(1, Math.floor(nameRoom / (fontSize * lineHeight)))) : 1;
  const nameSize = stacked ? fontSize : fitNameSize(fontSize, row.choreName, ticketLabel, rowWidth, row.assignees.length, dotSize, !!row.choreEmoji, dotSlot);
  const name = (
    <span
      style={{
        flex: dotsBelow ? undefined : 1,
        fontSize: nameSize,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--fcc-text)',
        minWidth: 0,
        overflow: 'hidden',
        ...(maxLines > 1
          ? { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical' as const, whiteSpace: 'normal' as const, lineHeight }
          : { whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' }),
      }}
    >
      {row.choreName}
      {showPoints && row.points > 1 && (
        <span style={{ fontSize: nameSize * 0.6, color: 'var(--fcc-text-2)', fontWeight: 600, marginLeft: nameSize * 0.3, whiteSpace: 'nowrap', display: 'inline-block' }}>
          {ticketLabel}
        </span>
      )}
    </span>
  );
  const icon = row.choreEmoji && (
    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', opacity: 0.85 }}>
      <ChoreIcon value={row.choreEmoji} size={fontSize * 0.8} color="var(--fcc-text-2)" />
    </span>
  );
  return (
    <div
      data-testid="fcc-row"
      style={{
        display: 'flex',
        flexDirection: dotsBelow ? 'column' : 'row',
        alignItems: dotsBelow ? 'stretch' : 'center',
        justifyContent: dotsBelow ? 'center' : undefined,
        padding: rowHeight === undefined ? `${fontSize * 0.4}px ${fontSize * 0.3}px` : `0 ${fontSize * 0.3}px`,
        height: rowHeight,
        boxSizing: 'border-box',
        flexShrink: 0,
        gap: dotsBelow ? fontSize * 0.25 : fontSize * 0.6,
        borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
      }}
    >
      {dotsBelow ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: fontSize * 0.4, minWidth: 0 }}>
          {icon}
          {name}
        </div>
      ) : (
        <>
          {icon}
          {name}
        </>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: dotGap(dotSize), flexShrink: 0, paddingLeft: dotsBelow && row.choreEmoji ? fontSize * 1.2 : 0 }}>
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
              label={labelled ? member.name : undefined}
              labelSize={nameLabelSize}
              allowTouch={allowTouch}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}
