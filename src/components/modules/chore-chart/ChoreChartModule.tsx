'use client';

import { useMemo } from 'react';
import type { ChoreChartConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import { balanceRows, fitChoreFontSize, fitPerRow, weekMembers } from './layout';

/** Mirrors BoardView's own column sizing, for the height estimate. */
const BOARD_COLUMN_EM = 6;
const BOARD_COLUMN_GAP = 8;

/** Mirrors StarChartView's legend sizing, for the height estimate. */
const STAR_LEGEND_ITEM_PX = (fontSize: number) => 5.5 * 0.65 * fontSize;
const STAR_LEGEND_GAP = 12;
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { useChoreData } from './useChoreData';
import { BoardView } from './views/BoardView';
import { StarChartView } from './views/StarChartView';
import { TodayView } from './views/TodayView';
import { ProgressView } from './views/ProgressView';
import { CompactView } from './views/CompactView';

interface ChoreChartModuleProps {
  config: ChoreChartConfig;
  style: ModuleStyle;
  timezone?: string;
}

export default function ChoreChartModule({ config, style, timezone }: ChoreChartModuleProps) {
  const view = config.view ?? 'board';
  const data = useChoreData(config);
  const t = useTranslate('modules');
  // The per-member views (board columns, compact checkbox columns, progress
  // rings) lay themselves out from the box width and the module font size:
  // a family of seven in a 500px card needs rows, not seven 70px columns.
  // The box height matters just as much: the chart is drawn in `em`, so
  // without this a ten-chore day simply ran off the bottom of its own card.
  const [frameRef, box] = useElementBox();

  // What the chosen view actually has to stack down the box.
  const { rows, sections } = useMemo(() => {
    const assignments = data.todayAssignments;
    if (view === 'board') {
      // A column per member, wrapped into groups when they do not all fit
      // across the box. Each group costs its own header plus its tallest
      // column, so that is what has to fit down the box.
      const perMember = new Map<string, number>();
      for (const a of assignments) perMember.set(a.memberId, (perMember.get(a.memberId) ?? 0) + 1);
      const tallest = Math.max(1, ...perMember.values());
      // Estimated at the module's own font size (the ceiling), so the guess
      // errs toward more groups and therefore smaller type, never clipping.
      const perRow = fitPerRow(box.width, BOARD_COLUMN_EM * style.fontSize, BOARD_COLUMN_GAP, perMember.size);
      const groups = Math.max(1, Math.ceil(perMember.size / perRow));
      return { rows: groups * tallest, sections: groups };
    }
    if (view === 'compact') {
      return { rows: new Set(assignments.map((a) => a.chore.id)).size, sections: 0 };
    }
    if (view === 'today') {
      const times = new Set(assignments.map((a) => a.chore.timeOfDay));
      return { rows: assignments.length, sections: config.showTimeOfDay === false ? 0 : times.size };
    }
    if (view === 'star-chart') {
      // A row per charted member, and the legend under it wraps the same
      // people into rows of its own.
      const charted = weekMembers(data.members, data.memberStats);
      const legendRows = config.showPoints === false
        ? 0
        : balanceRows(charted, fitPerRow(box.width, STAR_LEGEND_ITEM_PX(style.fontSize), STAR_LEGEND_GAP, charted.length)).length;
      return { rows: charted.length, sections: legendRows };
    }
    return { rows: 0, sections: 0 };
  }, [data, view, config.showTimeOfDay, config.showPoints, box.width, style.fontSize]);

  // Family data lives on the phone, not in the editor: the empty state sends
  // people to /remote and says which tab.
  if (data.members.length === 0 || data.chores.length === 0) {
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState
          icon={<>&#128203;</>}
          title={t(data.members.length === 0 ? 'chore-chart.noMembersYet' : 'chore-chart.noChoresYet')}
          hint={t('chore-chart.setUpFromPhoneHint')}
        />
      </ModuleWrapper>
    );
  }

  // The views draw in `em` off whatever the frame inherits, and use the same
  // number for their column maths, so the fitted size has to be set on the
  // frame as well as passed down. The frame fills the wrapper either way, so
  // setting its font size cannot feed back into the measurement.
  const fontSize = fitChoreFontSize({
    width: box.width, height: box.height, requested: style.fontSize, rows, sections, view,
  });
  const viewProps = { config, data, width: box.width, fontSize };

  return (
    <ModuleWrapper style={style}>
      <div ref={frameRef} className="w-full h-full min-h-0" style={{ fontSize: `${fontSize}px` }}>
        {view === 'board' && <BoardView {...viewProps} />}
        {view === 'star-chart' && <StarChartView {...viewProps} />}
        {view === 'today' && <TodayView {...viewProps} timezone={timezone} />}
        {view === 'progress' && <ProgressView {...viewProps} />}
        {view === 'compact' && <CompactView {...viewProps} />}
      </div>
    </ModuleWrapper>
  );
}
