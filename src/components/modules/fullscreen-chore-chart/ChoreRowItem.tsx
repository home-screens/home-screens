'use client';

import type { ChoreMember } from '@/types/config';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import AssigneeDot from './AssigneeDot';
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
   * Name above the dots instead of beside them. Landscape gives each
   * time-of-day a narrow column, where a wall-sized name and six dots on one
   * line leave one letter of the name; two lines keep both readable.
   */
  stacked?: boolean;
  /**
   * Width the row has to work with. A long name shrinks (never below 78% of
   * `fontSize`) until it fits beside its dots before it ellipsises, so a
   * light day with 80px rows does not read "Make your ..." across the room.
   */
  rowWidth?: number;
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
): number {
  if (!rowWidth || rowWidth <= 0) return fontSize;
  const dotsWidth = dotCount > 0 ? dotCount * dotSize + (dotCount - 1) * Math.max(dotSize * 0.2, 8) + fontSize * 0.6 : 0;
  const iconWidth = hasIcon ? fontSize * 0.8 + fontSize * 0.6 : 0;
  const available = rowWidth - fontSize * 0.6 - dotsWidth - iconWidth;
  if (available <= 0) return fontSize * MIN_NAME_FRACTION;
  // The ticket tag is 60% of the name size plus its gap.
  const ems = name.length * GLYPH_EM + (ticketLabel ? ticketLabel.length * GLYPH_EM * 0.6 + 0.3 : 0);
  const fitted = available / ems;
  return Math.max(fontSize * MIN_NAME_FRACTION, Math.min(fontSize, fitted));
}

export default function ChoreRowItem({
  row,
  fontSize,
  dotSize,
  rowHeight,
  stacked = false,
  rowWidth,
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
  const nameSize = fitNameSize(fontSize, row.choreName, ticketLabel, rowWidth, stacked ? 0 : row.assignees.length, dotSize, !!row.choreEmoji);
  const name = (
    <span
      style={{
        flex: stacked ? undefined : 1,
        fontSize: nameSize,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--fcc-text)',
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {row.choreName}
      {showPoints && row.points > 1 && (
        <span style={{ fontSize: nameSize * 0.6, color: 'var(--fcc-text-2)', fontWeight: 600, marginLeft: nameSize * 0.3 }}>
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
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        justifyContent: stacked ? 'center' : undefined,
        padding: rowHeight === undefined ? `${fontSize * 0.4}px ${fontSize * 0.3}px` : `0 ${fontSize * 0.3}px`,
        height: rowHeight,
        boxSizing: 'border-box',
        flexShrink: 0,
        gap: stacked ? fontSize * 0.25 : fontSize * 0.6,
        borderTop: isFirst ? 'none' : '1px solid var(--fcc-border-sub)',
      }}
    >
      {stacked ? (
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
      <div style={{ display: 'flex', gap: Math.max(dotSize * 0.2, 8), flexShrink: 0, paddingLeft: stacked && row.choreEmoji ? fontSize * 1.2 : 0 }}>
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
              initial={initialsMap.get(a.memberId) ?? member.name[0]}
              allowTouch={allowTouch}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}
