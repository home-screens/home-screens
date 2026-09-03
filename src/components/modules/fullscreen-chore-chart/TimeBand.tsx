'use client';

import type { ChoreMember, ChoreTimeOfDay } from '@/types/config';
import { useTranslate } from '@/i18n';
import ChoreRowItem from './ChoreRowItem';
import { TOD_ICONS, type ChoreRow, type ToggleParams } from './helpers';

interface TimeBandHeaderProps {
  tod: ChoreTimeOfDay;
  /** Label size. The icon is drawn 1.1× this. */
  fontSize: number;
  /** Band height; the label sits centred in it. */
  height?: number;
  currentTod: ChoreTimeOfDay | null;
  style?: React.CSSProperties;
}

export function TimeBandHeader({ tod, fontSize, height, currentTod, style }: TimeBandHeaderProps) {
  const TodIcon = TOD_ICONS[tod];
  const isCurrent = tod === currentTod;
  const headerColor = isCurrent ? 'var(--fcc-accent)' : 'var(--fcc-text-2)';
  const t = useTranslate('modules');

  return (
    <div
      data-testid="fcc-band-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: fontSize * 0.45,
        height,
        boxSizing: 'border-box',
        flexShrink: 0,
        ...style,
      }}
    >
      <TodIcon size={fontSize * 1.1} color={headerColor} strokeWidth={2} />
      <span
        style={{
          fontSize,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: headerColor,
          whiteSpace: 'nowrap',
        }}
      >
        {t(`fullscreen-chore-chart.timeOfDay.${tod}`)}
      </span>
    </div>
  );
}

interface TimeBandProps {
  tod: ChoreTimeOfDay;
  rows: ChoreRow[];
  /** Chore-name size for the rows. */
  fontSize: number;
  dotSize: number;
  /** Fit-rule row height; see FullscreenChoreChartModule. */
  rowHeight: number;
  /** Header band height in px, fixed by the label size. */
  headerHeight: number;
  headerFontSize: number;
  /** Width each row has; see ChoreRowItem.rowWidth. */
  rowWidth: number;
  /** Dots under the name on every row of this band; see ChoreRowItem.stacked. */
  stacked?: boolean;
  showHeader: boolean;
  showPoints: boolean;
  currentTod: ChoreTimeOfDay | null;
  memberMap: Map<string, ChoreMember>;
  initialsMap: Map<string, string>;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

export default function TimeBand({
  tod,
  rows,
  fontSize,
  dotSize,
  rowHeight,
  headerHeight,
  headerFontSize,
  rowWidth,
  stacked = false,
  showHeader,
  showPoints,
  currentTod,
  memberMap,
  initialsMap,
  allowTouch,
  onToggle,
}: TimeBandProps) {
  return (
    <div data-testid="fcc-band" style={{ flexShrink: 0 }}>
      {showHeader && (
        <TimeBandHeader
          tod={tod}
          fontSize={headerFontSize}
          height={headerHeight}
          currentTod={currentTod}
          style={{ padding: `0 ${fontSize * 0.3}px` }}
        />
      )}
      {rows.map((row, i) => (
        <ChoreRowItem
          key={row.choreId}
          row={row}
          fontSize={fontSize}
          dotSize={dotSize}
          rowHeight={rowHeight}
          rowWidth={rowWidth}
          stacked={stacked}
          // A header sits flush on its first row, so the pair reads as one block.
          isFirst={i === 0}
          showPoints={showPoints}
          memberMap={memberMap}
          initialsMap={initialsMap}
          allowTouch={allowTouch}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
