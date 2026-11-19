'use client';

import { useMemo } from 'react';
import type { ChoreChartConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import {
  allOwedDone, balanceRows, boardColumns, fitBoard, fitChoreFontSize, fitPerRow, fitStoreFontSize, resolveHistoryLimit, weekMembers,
} from './layout';

/** Mirrors StarChartView's legend sizing, for the height estimate. */
const STAR_LEGEND_ITEM_PX = (fontSize: number) => 5.5 * 0.65 * fontSize;
const STAR_LEGEND_GAP = 12;
import ModuleWrapper from '../ModuleWrapper';
import FamilyEmptyState from '../FamilyEmptyState';
import { ModuleLoadingState } from '../ModuleStates';
import { ChoreOverspentNotice } from './ChoreOverspentNotice';
import { useChoreData } from './useChoreData';
import { ChoreWriteNotice, useChoreWriteAlert } from './useChoreWriteAlert';
import { BoardView } from './views/BoardView';
import { StarChartView } from './views/StarChartView';
import { TodayView } from './views/TodayView';
import { ProgressView } from './views/ProgressView';
import { CompactView } from './views/CompactView';
import { RewardHistoryView } from './views/RewardHistoryView';
import { StoreView, resolveStoreLayout } from './views/StoreView';

interface ChoreChartModuleProps {
  config: ChoreChartConfig;
  style: ModuleStyle;
  timezone?: string;
}

export default function ChoreChartModule({ config, style, timezone }: ChoreChartModuleProps) {
  const view = config.view ?? 'board';
  const chores = useChoreData(config, timezone);
  const t = useTranslate('modules');
  // A tick that did not save is put back on screen by the hook; the card says
  // so at its foot. Every view ticks through this one door.
  const { alert: writeAlert, report: reportWrite } = useChoreWriteAlert(chores.members);
  const data = {
    ...chores,
    toggleComplete: async (choreId: string, memberId: string) => {
      const outcome = await chores.toggleComplete(choreId, memberId);
      reportWrite(outcome);
      return outcome;
    },
  };
  const drawsFromRewards = view === 'reward-history' || view === 'rewards-store';
  // The per-member views (board columns, compact checkbox columns, progress
  // rings) lay themselves out from the box width and the module font size:
  // a family of seven in a 500px card needs rows, not seven 70px columns.
  // The box height matters just as much: the chart is drawn in `em`, so
  // without this a ten-chore day simply ran off the bottom of its own card.
  const [frameRef, box] = useElementBox();

  // The board's columns, exactly as BoardView draws them: the fit has to make
  // room for every column on the board, day offs included.
  const columns = useMemo(
    () => (view === 'board' ? boardColumns(chores.members, chores.memberStats, chores.todayAssignments) : []),
    [view, chores.members, chores.memberStats, chores.todayAssignments],
  );

  // What the chosen view actually has to stack down the box.
  const { rows, sections, blocks, extra } = useMemo<{ rows: number; sections: number; blocks?: number; extra?: { rows: number; sections: number } }>(() => {
    const assignments = chores.todayAssignments;
    if (view === 'compact') {
      // Bonus chores follow the grid under a heading of their own, fitted in
      // only while the owed chores keep their place (see `extra`).
      const bonus = chores.todayBonus.length;
      return { rows: new Set(assignments.map((a) => a.chore.id)).size, sections: 0, extra: { rows: bonus, sections: bonus > 0 ? 1 : 0 } };
    }
    if (view === 'reward-history') {
      return { rows: Math.min(chores.allRedemptions.length, resolveHistoryLimit(config.historyLimit)), sections: 0 };
    }
    if (view === 'today') {
      // One row per chore, however many people share it: the view draws the
      // assignees as a run of dots on that single row.
      // Bonus chores follow under a section of their own.
      const times = new Set(assignments.map((a) => a.chore.timeOfDay));
      const bonus = chores.todayBonus.length;
      // With the headings off the day is one block of chores, not one per band.
      const merged = config.showTimeOfDay === false;
      return {
        rows: new Set(assignments.map((a) => a.chore.id)).size + bonus,
        sections: (merged ? 0 : times.size) + (bonus > 0 ? 1 : 0),
        blocks: (merged ? Math.min(1, times.size) : times.size) + (bonus > 0 ? 1 : 0),
      };
    }
    if (view === 'star-chart') {
      // A row per charted member, and the legend under it wraps the same
      // people into rows of its own.
      const charted = weekMembers(chores.members, chores.memberStats);
      const legendRows = config.showPoints === false
        ? 0
        : balanceRows(charted, fitPerRow(box.width, STAR_LEGEND_ITEM_PX(style.fontSize), STAR_LEGEND_GAP, charted.length)).length;
      return { rows: charted.length, sections: legendRows };
    }
    return { rows: 0, sections: 0 };
  }, [chores, view, config.showTimeOfDay, config.showPoints, config.historyLimit, box.width, style.fontSize]);

  // An empty roster only means a fresh install once the roster has actually
  // arrived. Until then (or when it could not be read) say so, rather than
  // telling a family their members are gone.
  if (data.isLoading || data.error) {
    return <ModuleLoadingState style={style} message={t('chore-chart.loading')} error={data.error} />;
  }
  // The reward history and the store are drawn from the rewards fetch, which
  // the other views treat as optional. Here "not arrived" must not read as "no rewards
  // redeemed yet".
  if (drawsFromRewards && (data.rewardsLoading || data.rewardsError)) {
    return <ModuleLoadingState style={style} message={t('chore-chart.loading')} error={data.rewardsError} />;
  }

  // Family data lives on the phone, not in the editor: the empty state sends
  // people to /remote and says which tab.
  if (data.members.length === 0 || (!drawsFromRewards && data.chores.length === 0)) {
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
  const storeLayout = resolveStoreLayout(config.storeLayout);
  // The board's fit also picks how its columns wrap, and the board draws that
  // arrangement: the height was budgeted for it and no other.
  const boardFit = view === 'board'
    ? fitBoard({
      width: box.width,
      height: box.height,
      requested: style.fontSize,
      columns,
      showTitle: config.showTitle !== false,
      showBalance: !!config.showPoints && columns.some((c) => (data.memberStats.get(c.member.id)?.rewardBalance ?? 0) > 0),
      allDone: allOwedDone(data.todayAssignments),
      bonus: data.todayBonus.length,
    })
    : null;
  const fontSize = boardFit ? boardFit.fontSize : view === 'rewards-store'
    ? fitStoreFontSize({
      width: box.width,
      height: box.height,
      requested: style.fontSize,
      layout: storeLayout,
      // Every reward switched on: the most any one person can be offered.
      count: data.rewards.filter((r) => r.enabled).length,
      showTitle: config.showTitle !== false,
      showPicker: storeLayout !== 'price-list' && data.members.length > 1,
      members: data.members.length,
      showBalance: storeLayout !== 'price-list',
      readOnly: config.allowDisplayComplete === false,
    })
    : fitChoreFontSize({
      width: box.width, height: box.height, requested: style.fontSize, rows, sections, blocks, extra, view,
    });
  const viewProps = { config, data, width: box.width, fontSize };

  return (
    <ModuleWrapper style={style}>
      <div ref={frameRef} className="w-full h-full min-h-0 flex flex-col" style={{ fontSize: `${fontSize}px` }}>
        <div className="flex-1 min-h-0">
          {boardFit && <BoardView config={config} data={data} fontSize={fontSize} perRow={boardFit.perRow} showBonus={boardFit.showBonus} />}
          {view === 'star-chart' && <StarChartView {...viewProps} />}
          {view === 'today' && <TodayView {...viewProps} timezone={timezone} />}
          {view === 'progress' && <ProgressView {...viewProps} />}
          {view === 'compact' && <CompactView {...viewProps} />}
          {view === 'reward-history' && <RewardHistoryView {...viewProps} />}
          {view === 'rewards-store' && <StoreView {...viewProps} height={box.height} />}
        </div>
        {/* Un-ticking takes back tickets that may already be spent. The chart
            gives the balance up a little room rather than letting it go
            negative with nothing on screen. */}
        {data.overspentNotice && (
          <ChoreOverspentNotice notice={data.overspentNotice} accentColor={config.accentColor ?? '#f59e0b'} />
        )}
        {writeAlert && <ChoreWriteNotice alert={writeAlert} accentColor={config.accentColor ?? '#f59e0b'} />}
      </div>
    </ModuleWrapper>
  );
}
