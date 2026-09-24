'use client';

import type { FamilyMember } from '@/types/family';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useElementBox } from '@/hooks/useElementBox';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import type { FullscreenChoreChartConfig, ModuleStyle, ChoreTimeOfDay} from '@/types/config';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, buildThemeCSSVars, resolveFullscreenAccent } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useChoreData } from '@/components/modules/chore-chart/useChoreData';
import { useOverspentMessage } from '@/components/modules/chore-chart/ChoreOverspentNotice';
import { partitionMembers, weekMembers } from '@/components/modules/chore-chart/layout';
import { createTZDate, formatDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import ChoreToast, { type ToastItem } from './ChoreToast';
import FamilyEmptyState from '../FamilyEmptyState';
import TimeBand from './TimeBand';
import MemberStrip from './MemberStrip';
import MemberBand, { memberHeaderHeight } from './MemberBand';
import BonusBand, { BonusMoreSheet, GrabbedSheet, GrabPickerSheet } from './BonusBand';
import { atGrabLimit, type BonusItem } from '@/lib/chore-bonus';
import { parseISO } from '@/lib/chore-assignments';
import type { ChoreWriteOutcome } from '@/components/modules/chore-chart/useChoreData';
import FitList from './FitList';
import { Star } from 'lucide-react';
import StarChart from './StarChart';
import WeekStrip from './WeekStrip';
import { RewardsStoreView } from './RewardsStoreView';
import { RewardHistoryView, type RewardHistoryVariant } from './RewardHistoryView';
import { type ChoreRow, buildChoreRows, getUniqueInitials } from '@/lib/chore-rows';
import {
  type ToggleParams,
  TOD_ORDER,
  ROW_HEIGHT_FLOOR,
  getOrientation,
  getCurrentTimeOfDay,
  buildMemberRows,
  fitRowHeight,
  fitDotSize,
  fitDotsInRoom,
  groupPillMetrics,
  groupPillMinRow,
  groupPillPadY,
  shouldStack,
  splitInOrder,
} from './helpers';

interface FullscreenChoreChartModuleProps {
  config: FullscreenChoreChartConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
  timezone?: string;
}

/** How long "Esme got it first" stays in the toast strip. */
const BONUS_ALERT_MS = 5000;
/**
 * After a tap opens or closes a sheet, a second tap near the same spot is
 * ignored for this long: it belongs to the same double tap, and what is under
 * the finger now (a name in the picker that just opened, a ring on the chart
 * a closing sheet uncovered) is not what it was aimed at. Taps anywhere else
 * go through at once.
 */
const NEAR_TAP_GUARD_MS = 2000;
/** A sheet that opened or closed this soon after a tap did so because of it (not a change from another screen). */
const TAP_CAUSED_MS = 800;
/** How near counts, at the reference 1080 px width. */
const NEAR_TAP_RADIUS_REF = 130;

/** Width the block sizes below are authored against. */
const REF_W = 1080;
/** The configured views that are a reward history, and which one each draws. */
const HISTORY_VARIANTS: Partial<Record<FullscreenChoreChartConfig['view'], RewardHistoryVariant>> = {
  'reward-history': 'days',
  'reward-totals': 'totals',
  'reward-spotlight': 'spotlight',
};

/** Chore name size at `medium` on the standard kiosk; `typographySize` multiplies it. */
const NAME_REF = 30;
/** A chore name is never drawn smaller than this, whatever the panel. */
const MIN_NAME_PX = 20;
/**
 * The header, chips and footer follow `typographySize` only this far: past
 * it the fixed blocks would eat the list, and the setting is about reading
 * chores from further away, not the date.
 */
const MAX_CHROME_TYPO = 1.35;
/** A landscape column never grows wider than this: a row wider than it puts the dot too far from its name. */
const MAX_COLUMN_REF = 900;
/** By-person sections across in landscape before they wrap to a second row of columns. */
const MAX_PERSON_COLUMNS = 4;
/** A column narrower than this puts the member fraction under the name. */
const COMPACT_COLUMN_REF = 520;
/** A column narrower than this puts a row's dots under its name instead of beside it. */
const STACK_COLUMN_REF = 700;
/** Landscape by-time bands pack into columns about this wide, so rows keep their dots beside the name. */
const BAND_COLUMN_REF = 820;
/** A time-of-day band costs this many rows on top of its chores when bands are packed. */
const BAND_HEADER_ROWS = 0.7;
/** A by-person section costs this many rows on top of its chores when columns are packed. */
const MEMBER_HEADER_ROWS = 1.6;

/**
 * Content height of the list box.
 *
 * This was the one hand-rolled observer in the codebase that already had the
 * right shape — a callback ref, because the box is a different node in portrait
 * and landscape and a ref bound once on mount would keep watching an unmounted
 * one. `useElementBox` is that same idea as a shared primitive, so the local
 * copy is gone rather than maintained alongside it.
 *
 * The box is `flex: 1` with `minHeight: 0`, so its height comes from the canvas
 * minus the fixed blocks, never from its own rows: measuring it cannot feed
 * back into the row size it decides.
 */
function useMeasuredHeight(): [(el: HTMLDivElement | null) => void, number] {
  const [ref, box] = useElementBox<HTMLDivElement>('content');
  return [ref, box.height];
}

interface Section {
  key: string;
  rows: ChoreRow[];
  tod?: ChoreTimeOfDay;
  member?: FamilyMember;
}

export default function FullscreenChoreChartModule({
  config,
  style: _style,
  fullscreenTheme,
  timezone,
}: FullscreenChoreChartModuleProps) {
  const { containerRef, dims } = useFullscreenDims();
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  const themeId = config.theme ?? fullscreenTheme ?? migrateFromDarkMode(config.darkMode);
  const theme = getThemeTokens(themeId);

  const isLandscape = getOrientation(dims.w, dims.h) === 'landscape';
  // Canvas scale: the fixed blocks (header, member chips, week, footer) are
  // authored in px for a 1080-wide panel and scale with the short side, so a
  // 720-wide panel or the editor preview shrinks them proportionally. The
  // chore list is not authored — it takes whatever height is left.
  const k = Math.min(dims.w, dims.h) / REF_W;
  const typoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const d = getDensityMultiplier(config.density);
  const pad = 40 * k * d;
  const weekProgress = config.weekProgress ?? 'chips';

  const { todayAssignments, memberStats, weekData, members, groups, chores, rewards, recentRedemptions, allRedemptions, toggleComplete, applyRedemption, overspentNotice, isLoading, error, rewardsLoading, rewardsError, todayBonus, bonusMarks, choreSettings, grabChore, today, todayKnown } = useChoreData(config);
  // Which bonus tile has a sheet open: the grab picker, or the grabbed tile's
  // "did it / let it go". Held by chore id so the sheet reads the latest poll.
  const [bonusSheet, setBonusSheet] = useState<{ kind: 'pick' | 'grabbed'; choreId: string } | { kind: 'more'; choreIds: string[] } | null>(null);
  // "Esme got it first": a refused tick or grab, said in the toast strip for a
  // few seconds. The wall cannot tell who tapped, so it names who has it.
  const [bonusAlert, setBonusAlert] = useState<{ text: string; bonus: boolean } | null>(null);
  useEffect(() => {
    if (!bonusAlert) return;
    const id = setTimeout(() => setBonusAlert(null), BONUS_ALERT_MS);
    return () => clearTimeout(id);
  }, [bonusAlert]);
  const closeBonusSheet = useCallback(() => setBonusSheet(null), []);
  const lastPointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const nearTapGuard = useRef<{ x: number; y: number; until: number } | null>(null);
  useEffect(() => {
    const tap = lastPointer.current;
    // Only a sheet this wall's own tap opened or closed: one closed by a change
    // on another screen leaves the spot of an old touch free.
    if (tap && Date.now() - tap.at < TAP_CAUSED_MS) nearTapGuard.current = { x: tap.x, y: tap.y, until: Date.now() + NEAR_TAP_GUARD_MS };
  }, [bonusSheet]);
  // Un-ticking hands tickets back that may already have been spent. The card
  // chart says so at its foot; here it rides in the toast strip.
  const overspentMessage = useOverspentMessage(overspentNotice);
  // Not until the day's ticks have arrived: before that every chore draws
  // open, and a tap would tick one already done, or date it by this screen's clock.
  const allowTouch = (config.allowDisplayComplete ?? true) && todayKnown;
  const byPerson = (config.layout ?? 'by-time') === 'by-person';
  // Who is on the chart: chips for people with chores today, one line for a
  // day off, nothing for a parent with no chores this week (a 0/0 card and
  // an empty star row said nothing).
  const { active: activeMembers, dayOff: dayOffMembers } = useMemo(() => partitionMembers(members, memberStats), [members, memberStats]);
  const chartedMembers = useMemo(() => weekMembers(members, memberStats), [members, memberStats]);
  // `tzNow` is a "shifted" Date whose local-time methods reflect the
  // configured IANA timezone — used by `getCurrentTimeOfDay` which reads
  // `.getHours()`. `formatDateInTZ` further down takes a real UTC instant
  // (`new Date()`) so it can do its own zone shift via `Intl.DateTimeFormat`;
  // passing the shifted Date would double-shift and yield the wrong day
  // near midnight.
  const tzNow = createTZDate(timezone);
  const currentTod = getCurrentTimeOfDay(tzNow.getHours());

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const toastsRef = useRef(toasts);
  useEffect(() => { toastsRef.current = toasts; }, [toasts]);

  // Redemption toasts — show when new redemptions appear from polling
  const seenRedemptionIds = useRef(new Set<string>());
  const seededRedemptions = useRef(false);
  useEffect(() => {
    if (recentRedemptions.length === 0) return;
    // On first load, seed the set so we don't toast stale entries
    if (!seededRedemptions.current) {
      seededRedemptions.current = true;
      for (const r of recentRedemptions) seenRedemptionIds.current.add(r.id);
      return;
    }
    for (const r of recentRedemptions) {
      if (seenRedemptionIds.current.has(r.id)) continue;
      seenRedemptionIds.current.add(r.id);
      const member = members.find((m) => m.id === r.memberId);
      const id = `redeem-${r.id}`;
      setToasts((prev) => [...prev.slice(-2), {
        id,
        choreId: '',
        memberId: r.memberId,
        choreName: `${r.rewardName} 🎟️`,
        memberName: r.memberName,
        memberColor: member?.color ?? '#a3a3a3',
        wasCompleted: true,
        verb: t('fullscreen-chore-chart.verbs.redeemed'),
      }]);
    }
  }, [recentRedemptions, members, t]);

  // ── Rewards Store view switching ──
  const [showRewardsOverride, setShowRewardsOverride] = useState(false);

  const effectiveView = showRewardsOverride ? 'rewards-store' : (config.view ?? 'chores');
  // The store's own History pill: the totals view, opened in place.
  const [showStoreHistory, setShowStoreHistory] = useState(false);
  const closeStoreHistory = useCallback(() => setShowStoreHistory(false), []);
  const historyVariant: RewardHistoryVariant | null = effectiveView === 'rewards-store'
    ? (showStoreHistory ? 'totals' : null)
    : HISTORY_VARIANTS[effectiveView] ?? null;

  const rewardBalances = useMemo(() => {
    const b: Record<string, number> = {};
    for (const [id, stats] of memberStats) {
      b[id] = stats.rewardBalance;
    }
    return b;
  }, [memberStats]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Words for a write the hub refused: who has it, when that is known. Only
  // a bonus refusal gets bonus words; anything else (a regular chore, a lost
  // connection) is a plain "didn't save".
  const refusalText = useCallback((outcome: ChoreWriteOutcome) => {
    if (outcome.ok) return null;
    if (!outcome.refusal) return t('fullscreen-chore-chart.saveFailed');
    const name = members.find((m) => m.id === outcome.memberId)?.name;
    if (outcome.refusal === 'grabbed' && name) return t('chore-chart.bonus.refused.grabbed', { name });
    if (outcome.refusal === 'taken' && name) return t('chore-chart.bonus.refused.taken', { name });
    return t('chore-chart.bonus.refused.other');
  }, [members, t]);

  const refusalAlert = useCallback((outcome: ChoreWriteOutcome) => {
    const text = refusalText(outcome);
    return text ? { text, bonus: !outcome.ok && !!outcome.refusal } : null;
  }, [refusalText]);

  // The toast (with its Undo) only goes up once the hub has taken the tick:
  // a refused tick says who has the chore instead.
  const handleToggle = useCallback(async ({ choreId, memberId, choreName, memberName, memberColor, wasCompleted }: ToggleParams) => {
    const outcome = await toggleComplete(choreId, memberId);
    if (!outcome.ok) {
      setBonusAlert(refusalAlert(outcome));
      return;
    }
    // A try that went through clears an earlier "didn't save".
    setBonusAlert(null);
    // Nothing changed on the hub: no toast claiming it did.
    if (!outcome.changed) return;
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-2), { id, choreId, memberId, choreName, memberName, memberColor, wasCompleted: !wasCompleted }]);
  }, [toggleComplete, refusalAlert]);

  const handleGrab = useCallback(async (choreId: string, memberId: string, action: 'grab' | 'let-go') => {
    const outcome = await grabChore(choreId, memberId, action);
    if (!outcome.ok) setBonusAlert(refusalAlert(outcome));
  }, [grabChore, refusalAlert]);

  // An Undo that did not go through says so, as a tick does: a kid who
  // thinks it was undone would otherwise keep tickets nobody earned.
  const handleUndo = useCallback(async (toastId: string) => {
    const toast = toastsRef.current.find((t) => t.id === toastId);
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    if (!toast) return;
    const outcome = await toggleComplete(toast.choreId, toast.memberId);
    if (outcome.ok) {
      setBonusAlert(null);
      return;
    }
    setBonusAlert(refusalAlert(outcome));
    // The toast comes back with its Undo, so "try again" has something to tap:
    // a finished bonus tile cannot be tapped to undo.
    if (!outcome.refusal) setToasts((prev) => [...prev.slice(-2), { ...toast, id: String(++toastIdRef.current) }]);
  }, [toggleComplete, refusalAlert]);

  // Build chore rows grouped by time-of-day; dots keep household order.
  const memberOrder = useMemo(() => new Map(members.map((m, i) => [m.id, i])), [members]);
  const choreGroups = useMemo(() => buildChoreRows(todayAssignments, memberOrder, groups), [todayAssignments, memberOrder, groups]);

  // Overall completion. A chore marked "not today" is owed by nobody, and
  // bonus chores never count, so neither is in the sum.
  const owedToday = todayAssignments.filter((a) => !a.isSkipped);
  const totalChores = owedToday.length;
  const totalDone = owedToday.filter((a) => a.isCompleted).length;
  const overallPct = totalChores > 0 ? Math.round((totalDone / totalChores) * 100) : 0;

  // Date — `tzNow.getDay()` is correct because shifted-Date local-time
  // methods read in target zone, but `formatDateInTZ` needs a real UTC
  // instant so its internal `Intl` shift doesn't double-apply.
  // With no time zone set, the header names the hub's day, as the chores
  // under it are: a screen on another clock no longer says Thursday above
  // Wednesday's list.
  // Blank until the hub has said which day it is: the server's first paint
  // and a screen on another clock would otherwise name different days.
  const headerDate = parseISO(today);
  const dayName = todayKnown ? formatDateInTZ(headerDate, undefined, { weekday: 'long' }, locale) : '\u00a0';
  const dateStr = todayKnown ? formatDateInTZ(headerDate, undefined, { month: 'long', day: 'numeric', year: 'numeric' }, locale) : '\u00a0';

  // Member lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const initialsMap = useMemo(() => getUniqueInitials(members), [members]);

  // If showTimeOfDay is off, merge all groups into a single list
  const mergedGroups = useMemo(() => {
    if (config.showTimeOfDay) return choreGroups;
    const all: ChoreRow[] = [];
    for (const tod of TOD_ORDER) {
      const rows = choreGroups.get(tod);
      if (rows) all.push(...rows);
    }
    const merged = new Map<ChoreTimeOfDay, ChoreRow[]>();
    if (all.length > 0) merged.set('anytime', all);
    return merged;
  }, [config.showTimeOfDay, choreGroups]);

  const displayTods = useMemo<ChoreTimeOfDay[]>(() => (
    config.showTimeOfDay
      ? TOD_ORDER.filter((tod) => choreGroups.has(tod))
      : mergedGroups.has('anytime') ? ['anytime'] : []
  ), [config.showTimeOfDay, choreGroups, mergedGroups]);

  const displayGroups = config.showTimeOfDay ? choreGroups : mergedGroups;

  // By person: one section per member with a chore today, rows in time order.
  const memberRows = useMemo(
    () => buildMemberRows(activeMembers, todayAssignments, config.showTimeOfDay),
    [activeMembers, todayAssignments, config.showTimeOfDay],
  );
  const sectionMembers = useMemo(() => activeMembers.filter((m) => memberRows.has(m.id)), [activeMembers, memberRows]);
  const sectionCount = byPerson ? sectionMembers.length : displayTods.length;

  // ── Sizes ──
  // Text follows `typographySize`; the header, chips and footer follow it
  // only up to MAX_CHROME_TYPO so the list keeps its room.
  const tx = k * typoMul;
  const tc = k * Math.min(typoMul, MAX_CHROME_TYPO);
  const authoredName = Math.max(MIN_NAME_PX, NAME_REF * tx);
  const bandGap = 20 * k * d;
  const listWidth = dims.w - pad * 2;
  const hasChoresToday = totalChores > 0;

  // ── Layout ──
  // The list is a grid of cells; each cell stacks whole sections (a
  // time-of-day band or a member) and scrolls on its own when it must.
  // Portrait by-time: one cell. Portrait by-person: one cell, or two columns
  // when a big family cannot fit at the row floor. Landscape by-time: one
  // cell per band. Landscape by-person: up to four across, then a second
  // row of columns.
  const sections = useMemo<Section[]>(() => (
    byPerson
      ? sectionMembers.map((m) => ({ key: m.id, rows: memberRows.get(m.id) ?? [], member: m }))
      : displayTods.map((tod) => ({ key: tod, rows: displayGroups.get(tod) ?? [], tod }))
  ), [byPerson, sectionMembers, memberRows, displayTods, displayGroups]);

  const [listRef, listHeight] = useMeasuredHeight();
  const weightOf = (sec: Section) => sec.rows.length + MEMBER_HEADER_ROWS;
  let cols = 1;
  let cells: Section[][];
  if (!isLandscape && !byPerson) {
    cells = [sections];
  } else if (!isLandscape) {
    const wideHeader = memberHeaderHeight(28 * tx, false);
    const need = sections.reduce((sum, sec) => sum + sec.rows.length * ROW_HEIGHT_FLOOR * k + wideHeader, 0) + Math.max(0, sections.length - 1) * bandGap;
    cols = listHeight > 0 && need > listHeight && sections.length > 1 ? 2 : 1;
    cells = splitInOrder(sections, weightOf, cols);
  } else if (!byPerson) {
    // Bands share a few wide columns rather than one narrow column each, so
    // a morning with one chore does not own a quarter of the wall.
    cols = Math.max(1, Math.min(sections.length, Math.floor(listWidth / (BAND_COLUMN_REF * k))));
    cells = splitInOrder(sections, (sec) => sec.rows.length + (config.showTimeOfDay ? BAND_HEADER_ROWS : 0), cols);
  } else {
    cols = Math.max(1, Math.min(MAX_PERSON_COLUMNS, sections.length));
    cells = splitInOrder(sections, weightOf, cols);
  }
  const rawColumnWidth = (listWidth - (cols - 1) * bandGap) / cols;
  const columnWidth = isLandscape && cols <= 2 ? Math.min(rawColumnWidth, MAX_COLUMN_REF * k) : rawColumnWidth;
  // Inside a cell a row has the column minus the cell's own side padding.
  const cellPadX = isLandscape ? pad * 0.5 : 0;
  const rowWidth = columnWidth - cellPadX * 2;
  const compactHeader = columnWidth < COMPACT_COLUMN_REF * tx;
  const cellHeight = listHeight;

  // The fit rule: rows share what the tightest cell leaves after its headers
  // and gaps, capped by typography and floored so a heavy day scrolls. A
  // heavy day at a big type size squeezes the name under the row; the name
  // follows the row down rather than overflowing it, and the band and member
  // labels follow the name so a label is never bigger than the chores under
  // it. Two passes: the labels set the header height that sets the row.
  const fitFor = (name: number) => {
    const bandLabel = Math.min(24 * tx, name * 0.8);
    const memberName = Math.min(28 * tx, name * 0.95);
    const bandHeader = config.showTimeOfDay ? bandLabel * 2.2 : 0;
    const memberHeader = memberHeaderHeight(memberName, compactHeader);
    const header = byPerson ? memberHeader : bandHeader;
    let tightest = Infinity;
    let tightestRows = 0;
    for (const cell of cells) {
      const rows = cell.reduce((sum, sec) => sum + sec.rows.length, 0);
      if (rows === 0) continue;
      const fixed = cell.length * header + Math.max(0, cell.length - 1) * bandGap;
      const share = (cellHeight - fixed) / rows;
      if (share < tightest) { tightest = share; tightestRows = rows; }
    }
    const row = fitRowHeight({
      listHeight: tightestRows > 0 && cellHeight > 0 ? tightest * tightestRows : 0,
      chores: tightestRows,
      k,
      typoMul,
      densityMul: d,
    });
    return { row, name: Math.max(MIN_NAME_PX, Math.min(authoredName, row * 0.55)), bandLabel, memberName, bandHeader, memberHeader, header };
  };
  const first = fitFor(authoredName);
  const fit = first.name < authoredName ? fitFor(first.name) : first;
  const rowHeight = fit.row;
  const nameSize = fit.name;
  const bandLabelSize = fit.bandLabel;
  const memberNameSize = fit.memberName;
  const bandHeaderPx = fit.bandHeader;
  const memberHeaderPx = fit.memberHeader;
  const headerPx = fit.header;
  const dotBase = fitDotSize(rowHeight, k);
  const iconRoom = nameSize * 1.4;
  // Stacking (dots under the name) is decided per cell from its widest row,
  // so every row in a column has the same shape; a stacked row grows past
  // the fitted height for its second line, and the cell scrolls if it must.
  const cellShapes = cells.map((cell) => {
    let widest = 0;
    // A group pill adds its label and padding around the dots; the widest
    // one in the cell is set aside before the dots are sized.
    let pillExtra = 0;
    for (const sec of cell) for (const row of sec.rows) {
      widest = Math.max(widest, row.assignees.length);
      if (row.groupLabel) pillExtra = Math.max(pillExtra, groupPillMetrics(row.groupLabel, nameSize, dotBase, row.groupExtra).extra);
    }
    // A wide column keeps dots beside the name and shrinks them to fit; only
    // a narrow column stacks.
    const stacked = columnWidth < STACK_COLUMN_REF * k && shouldStack(widest, dotBase, rowWidth - iconRoom, pillExtra);
    const dotSize = stacked
      ? fitDotsInRoom(dotBase, widest, rowWidth - nameSize * 0.6 - iconRoom - pillExtra)
      // Beside the name, a pill's label and padding come out of the name's
      // share, not the dots': the rings are the tap targets and stay full
      // size, and a long name wraps. Only when dots and pill together would
      // pass three fifths of the row do the dots give way too.
      : fitDotsInRoom(dotBase, widest, Math.min((rowWidth - iconRoom) * 0.4, (rowWidth - iconRoom) * 0.6 - pillExtra));
    // A pill is taller than its dots by its own top and bottom padding.
    const stackedNeed = nameSize * 1.15 + nameSize * 0.35 + dotSize + (pillExtra > 0 ? groupPillPadY(nameSize, dotSize, undefined) * 2 + 2 : 0) + nameSize * 0.8;
    // A flat row holding a pill is never shorter than the pill: on a dense
    // chart the ring alone may take nine tenths of the fitted row.
    const flatNeed = pillExtra > 0 ? Math.max(rowHeight, groupPillMinRow(nameSize, dotSize)) : rowHeight;
    const cellRowHeight = stacked ? Math.max(rowHeight, stackedNeed) : flatNeed;
    // On a light day the rows stop at the cap and the slack goes between the
    // bands (up to three gaps' worth each); what is left stays at the bottom.
    const rows = cell.reduce((sum, sec) => sum + sec.rows.length, 0);
    const used = rows * cellRowHeight + cell.length * headerPx + Math.max(0, cell.length - 1) * bandGap;
    const slack = cellHeight > 0 ? Math.max(0, cellHeight - used) : 0;
    const gap = cell.length > 1 ? bandGap + Math.min(bandGap * 2, slack / (cell.length - 1)) : bandGap;
    // A very light day sits centred in its space rather than hugging the top.
    const centred = cellHeight > 0 && slack > cellHeight * 0.3;
    return { stacked, dotSize, rowHeight: cellRowHeight, gap, centred };
  });

  const chipScale = isLandscape ? tc * 0.85 : tc;
  const memberStripWidth = isLandscape ? dims.w * 0.62 : listWidth;
  const chipDetail = weekProgress === 'chips' ? 'stars' : 'bar';

  const weekBottom = weekProgress === 'grid'
    ? <StarChart k={k} weekData={weekData} members={chartedMembers} />
    : weekProgress === 'strip'
      ? <WeekStrip k={k} weekData={weekData} members={chartedMembers} />
      : null;

  const dayOffLine = dayOffMembers.length > 0 && (
    <div
      data-testid="fcc-day-off"
      style={{ fontSize: 24 * tc, fontWeight: 500, color: 'var(--fcc-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {t('chore-chart.dayOffList', { names: dayOffMembers.map((m) => m.name).join(', ') })}
    </div>
  );

  const renderSection = (sec: Section, shape: { stacked: boolean; dotSize: number; rowHeight: number; gap: number; centred: boolean }) => (
    sec.member ? (
      <MemberBand
        key={sec.key}
        member={sec.member}
        stats={memberStats.get(sec.member.id)}
        rows={sec.rows}
        fontSize={nameSize}
        dotSize={shape.dotSize}
        rowHeight={shape.rowHeight}
        headerHeight={memberHeaderPx}
        headerFontSize={memberNameSize}
        rowWidth={rowWidth}
        stacked={shape.stacked}
        compact={compactHeader}
        showPoints={config.showPoints}
        showStreaks={config.showStreaks}
        showTimeOfDay={config.showTimeOfDay}
        weekData={weekData}
        detail={chipDetail}
        memberMap={memberMap}
        initialsMap={initialsMap}
        allowTouch={allowTouch}
        onToggle={handleToggle}
      />
    ) : (
      <TimeBand
        key={sec.key}
        tod={sec.tod!}
        rows={sec.rows}
        fontSize={nameSize}
        dotSize={shape.dotSize}
        rowHeight={shape.rowHeight}
        headerHeight={bandHeaderPx}
        headerFontSize={bandLabelSize}
        rowWidth={rowWidth}
        stacked={shape.stacked}
        showHeader={config.showTimeOfDay}
        showPoints={config.showPoints}
        currentTod={currentTod}
        memberMap={memberMap}
        initialsMap={initialsMap}
        allowTouch={allowTouch}
        onToggle={handleToggle}
      />
    )
  );

  // The band never grows past the medium text size: bigger text is for the
  // chores that count, and a growing band took their room.
  const bonusScale = k * Math.min(typoMul, 1);
  const tileProps = {
    memberMap,
    initialsMap,
    s: bonusScale,
    allowTouch,
    today,
    formatDay: (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long' });
    },
    onOpenGrab: (item: BonusItem) => setBonusSheet({ kind: 'pick', choreId: item.chore.id }),
    onOpenGrabbed: (item: BonusItem) => setBonusSheet({ kind: 'grabbed', choreId: item.chore.id }),
    onToggle: handleToggle,
  };
  const bonusTiles = todayBonus.length > 0 && (
    <BonusBand
      items={todayBonus}
      isLandscape={isLandscape}
      onOpenMore={(hidden) => setBonusSheet({ kind: 'more', choreIds: hidden.map((i) => i.chore.id) })}
      {...tileProps}
    />
  );
  // A landscape wall by person has room to spare beside the date, where the
  // family chips sit in the other layout: the band goes there, and the
  // people's chores keep the full height below.
  const bonusInHeader = isLandscape && byPerson;
  const bonusBand = bonusTiles && !bonusInHeader && (
    <div style={{ flexShrink: 0, padding: `${18 * k}px ${pad}px ${4 * k}px` }}>{bonusTiles}</div>
  );
  const sheetItem = bonusSheet && bonusSheet.kind !== 'more' ? todayBonus.find((i) => i.chore.id === bonusSheet.choreId) : undefined;
  const sheetHolder = sheetItem?.grab?.status === 'grabbed' ? memberMap.get(sheetItem.grab.memberId) : undefined;
  // A sheet whose chore changed elsewhere (grabbed, finished, let go on
  // another screen) closes for good. Left open but hidden, it came back by
  // itself when the chore changed back, under whoever was tapping the chart.
  const sheetShowing = bonusSheet?.kind === 'more'
    ? bonusSheet.choreIds.some((id) => todayBonus.some((i) => i.chore.id === id))
    : !!(bonusSheet && sheetItem && ((bonusSheet.kind === 'pick' && sheetItem.grab?.status === 'open') || (bonusSheet.kind === 'grabbed' && sheetHolder)));
  useEffect(() => { if (bonusSheet && !sheetShowing) setBonusSheet(null); }, [bonusSheet, sheetShowing]);
  // At the grab limit, the chore a person is holding, so the picker can say what to finish first.
  const heldBy = (memberId: string) => {
    if (!atGrabLimit(memberId, chores, today, bonusMarks, choreSettings, groups)) return null;
    // Every chore they hold: at a limit of two, naming one hid the other.
    return todayBonus.filter((i) => i.grab?.status === 'grabbed' && i.grab.memberId === memberId).map((i) => i.chore.name).join(', ');
  };
  const bonusSheets = bonusSheet?.kind === 'more' ? (
    <BonusMoreSheet
      isLandscape={isLandscape}
      // In the band's order (grabbed, open, everyone can, done), as the ids were handed over.
      items={bonusSheet.choreIds.flatMap((id) => todayBonus.filter((i) => i.chore.id === id))}
      onClose={closeBonusSheet}
      {...tileProps}
    />
  ) : bonusSheet && sheetItem && (
    bonusSheet.kind === 'pick' && sheetItem.grab?.status === 'open' ? (
      <GrabPickerSheet
        item={sheetItem}
        memberMap={memberMap}
        initialsMap={initialsMap}
        s={bonusScale}
        heldBy={heldBy}
        onPick={(memberId) => { void handleGrab(sheetItem.chore.id, memberId, 'grab'); closeBonusSheet(); }}
        onClose={closeBonusSheet}
      />
    ) : bonusSheet.kind === 'grabbed' && sheetHolder ? (
      <GrabbedSheet
        item={sheetItem}
        holder={sheetHolder}
        s={bonusScale}
        onDone={() => {
          void handleToggle({ choreId: sheetItem.chore.id, memberId: sheetHolder.id, choreName: sheetItem.chore.name, memberName: sheetHolder.name, memberColor: sheetHolder.color, wasCompleted: false });
          closeBonusSheet();
        }}
        onLetGo={() => { void handleGrab(sheetItem.chore.id, sheetHolder.id, 'let-go'); closeBonusSheet(); }}
        onClose={closeBonusSheet}
      />
    ) : null
  );

  const listGrid = sectionCount > 0 && (
    <div
      ref={listRef}
      data-testid="fcc-list-box"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, ${Math.round(columnWidth)}px))`,
        gridAutoRows: 'minmax(0, 1fr)',
        justifyContent: 'center',
        columnGap: bandGap,
        padding: `0 ${pad}px`,
      }}
    >
      {cells.map((cell, i) => (
        <FitList
          key={cell[0]?.key ?? i}
          fontSize={22 * tc}
          testId={i === 0 ? 'fcc-list' : undefined}
          style={{
            minWidth: 0,
            borderLeft: isLandscape && i % cols > 0 ? '1px solid var(--fcc-border-sub)' : undefined,
          }}
          innerStyle={{ display: 'flex', flexDirection: 'column', justifyContent: cellShapes[i].centred ? 'center' : 'flex-start', gap: cellShapes[i].gap, padding: `${isLandscape ? 12 * k : 0}px ${cellPadX}px ${cellShapes[i].centred ? 24 * k : 0}px` }}
        >
          {cell.map((sec) => renderSection(sec, cellShapes[i]))}
        </FitList>
      ))}
    </div>
  );

  // Nothing has arrived yet, or it could not be read. An empty roster only
  // means a fresh install once the data is really in.
  const isPending = isLoading || !!error;
  const isUnset = !isPending && (members.length === 0 || chores.length === 0);
  const footer = !isUnset && (config.showPoints || config.showStreaks) && (
    <div style={{
      flexShrink: 0,
      padding: `${16 * k}px ${pad}px ${26 * k}px`,
      borderTop: '1px solid var(--fcc-border-sub)',
      display: 'flex',
      gap: pad,
      fontSize: 24 * tc,
      color: 'var(--fcc-text-2)',
      fontWeight: 500,
    }}>
      <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {config.showPoints && (
          <span style={{ color: 'var(--fcc-text)', fontWeight: 600 }}>
            {t('fullscreen-chore-chart.weeklyTicketsValue', {
              count: Array.from(memberStats.values()).reduce((sum, ms) => sum + ms.weeklyPoints, 0),
            })}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {config.showStreaks && (
          <>
            {t('fullscreen-chore-chart.bestStreakLabel')} <span style={{ color: 'var(--fcc-text)', fontWeight: 600 }}>
              {(() => {
                let best = { name: '', streak: 0 };
                for (const m of members) {
                  const ms = memberStats.get(m.id);
                  if (ms && ms.streak > best.streak) best = { name: m.name, streak: ms.streak };
                }
                return best.streak > 0
                  ? t('fullscreen-chore-chart.bestStreakValue', { name: best.name, count: best.streak })
                  : t('fullscreen-chore-chart.bestStreakNone');
              })()}
            </span>
          </>
        )}
      </div>
    </div>
  );

  const rewardsButton = config.showRewardsButton && (
    <button
      onClick={() => setShowRewardsOverride(true)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8 * tc,
        padding: `${8 * tc}px ${20 * tc}px`,
        minHeight: 44 * k,
        borderRadius: 999,
        border: '1px solid var(--fcc-border)',
        background: 'var(--fcc-surface)',
        color: 'var(--fcc-accent)',
        fontSize: 22 * tc,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: 'var(--fcc-card-shadow)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <Star size={22 * tc} fill="currentColor" /> {t('fullscreen-chore-chart.rewardsButton')}
    </button>
  );

  // "No chores today" is a day off. A household with no members or no chores
  // at all is a fresh install, and that needs to say where chores come from,
  // at a size that reads across the room.
  const emptyState = isPending ? (
    <div
      data-testid={error ? 'module-not-updating' : 'fcc-loading'}
      aria-live="polite"
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fcc-text-2)', fontSize: 40 * tc, textAlign: 'center', padding: pad }}
    >
      {t(error ? 'common.notUpdating' : 'chore-chart.loading')}
    </div>
  ) : isUnset ? (
    <div style={{ flex: 1, display: 'flex', color: 'var(--fcc-text)' }}>
      <FamilyEmptyState
        icon={<>&#128203;</>}
        title={t(members.length === 0 ? 'chore-chart.noMembersYet' : 'chore-chart.noChoresYet')}
        hint={t('chore-chart.setUpFromPhoneHint')}
        fontSize={44 * k}
      />
    </div>
  ) : (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 * k, color: 'var(--fcc-text-2)', fontSize: 40 * tc, textAlign: 'center', padding: pad }}>
      <div>{t('fullscreen-chore-chart.noChoresToday')}</div>
      {dayOffLine}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="fcc-root"
      onPointerDownCapture={(e) => { lastPointer.current = { x: e.clientX, y: e.clientY, at: Date.now() }; }}
      onClickCapture={(e) => {
        const near = nearTapGuard.current;
        if (!near || Date.now() > near.until || e.detail === 0) return;
        if (Math.hypot(e.clientX - near.x, e.clientY - near.y) > NEAR_TAP_RADIUS_REF * k) return;
        e.stopPropagation();
        e.preventDefault();
      }}
      style={{
        width: '100%',
        height: '100%',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        ...buildThemeCSSVars('fcc', theme),
        // Empty accentColor follows the theme's own accent (see the registry default).
        '--fcc-accent': resolveFullscreenAccent(config.accentColor, theme, DEFAULT_ACCENT_COLOR),
        // Bonus chores draw in the accent; on a light theme it is darkened so
        // amber on white still reads from across the room.
        '--fcc-bonus': theme.isDark ? 'var(--fcc-accent)' : 'color-mix(in srgb, var(--fcc-accent) 62%, #000)',
        colorScheme: theme.isDark ? 'dark' : 'light',
      } as React.CSSProperties}
    >
      <style>{`
        .fcc-root {
          background-color: var(--fcc-bg);
          background-image: var(--fcc-bg-image);
          color: var(--fcc-text);
        }
      `}</style>

      {historyVariant ? (
        // The history is drawn from the rewards fetch alone, so "not arrived"
        // and "could not be read" must not read as "nothing redeemed yet".
        isPending || rewardsLoading || rewardsError ? (
          <div
            data-testid={error || rewardsError ? 'module-not-updating' : 'fcc-loading'}
            aria-live="polite"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fcc-text-2)', fontSize: 40 * tc, textAlign: 'center', padding: pad }}
          >
            {t(error || rewardsError ? 'common.notUpdating' : 'chore-chart.loading')}
          </div>
        ) : (
          <RewardHistoryView
            variant={historyVariant}
            members={members}
            redemptions={allRedemptions}
            k={k}
            typoMul={typoMul}
            density={config.density}
            isLandscape={isLandscape}
            onBack={showStoreHistory ? closeStoreHistory : undefined}
            backLabel={t('fullscreen-chore-chart.rewardsStore.title')}
            idleTimeoutMs={showStoreHistory ? 60_000 : undefined}
          />
        )
      ) : effectiveView === 'rewards-store' ? (
        <RewardsStoreView
          members={members}
          rewards={rewards}
          balances={rewardBalances}
          redemptions={allRedemptions}
          k={k}
          typoMul={typoMul}
          density={config.density}
          isLandscape={isLandscape}
          allowTouch={allowTouch}
          accentColor={config.accentColor}
          theme={theme}
          onBack={showRewardsOverride ? () => setShowRewardsOverride(false) : undefined}
          onRedeemed={applyRedemption}
          onShowHistory={() => setShowStoreHistory(true)}
          idleTimeoutMs={showRewardsOverride ? 60_000 : undefined}
        />
      ) : isLandscape ? (
        <>
          {/* Landscape header: date + progress on the left, member chips on the right. */}
          <div style={{ display: 'flex', alignItems: 'stretch', padding: `${20 * k}px ${pad}px`, gap: 28 * k, borderBottom: '1px solid var(--fcc-border-sub)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 28 * k, borderRight: '1px solid var(--fcc-border-sub)', minWidth: 320 * tc }}>
              <div style={{ fontSize: 20 * tc, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {dayName}
              </div>
              <div style={{ fontSize: 38 * tc, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', marginTop: 2 * k }}>
                {dateStr}
              </div>
              {hasChoresToday && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 * k, marginTop: 14 * k }}>
                  <div style={{ flex: 1, height: 8 * k, background: 'var(--fcc-border-sub)', borderRadius: 4 * k, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: 4 * k, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ fontSize: 34 * tc, fontWeight: 800, color: 'var(--fcc-accent)', flexShrink: 0, lineHeight: 1 }}>
                    {overallPct}%
                  </div>
                </div>
              )}
              {rewardsButton && <div style={{ marginTop: 14 * k, display: 'flex' }}>{rewardsButton}</div>}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 * k }}>
                {byPerson ? <>{dayOffLine}{bonusTiles}</> : (
                  <MemberStrip members={activeMembers} dayOff={dayOffMembers} memberStats={memberStats} weekData={weekData} detail={chipDetail} c={chipScale} gap={12 * k} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} maxPerRow={4} />
                )}
              </div>
            </div>
          </div>

          {bonusBand}
          {listGrid}
          {sectionCount === 0 && (
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{emptyState}</div>
          )}

          {weekBottom && (
            <div style={{ flexShrink: 0, margin: `0 ${pad}px`, borderTop: '1px solid var(--fcc-border-sub)' }}>{weekBottom}</div>
          )}
          {footer}
        </>
      ) : (
        <>
          {/* Portrait header: day + date left, completion right, progress bar and the rewards pill on one line. */}
          <div style={{ padding: `${pad}px ${pad}px ${byPerson ? 18 * k : 0}px`, flexShrink: 0, borderBottom: byPerson ? '1px solid var(--fcc-border-sub)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: pad }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22 * tc, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {dayName}
                </div>
                <div style={{ fontSize: 46 * tc, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fcc-text)', marginTop: 2 * k, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {dateStr}
                </div>
              </div>
              {hasChoresToday && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 * k, flexShrink: 0 }}>
                  <div style={{ fontSize: 64 * tc, fontWeight: 800, color: 'var(--fcc-accent)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {overallPct}<span style={{ fontSize: 28 * tc, color: 'var(--fcc-text-2)', fontWeight: 700 }}>%</span>
                  </div>
                  <div style={{ fontSize: 16 * tc, fontWeight: 600, color: 'var(--fcc-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {t('fullscreen-chore-chart.complete')}
                  </div>
                </div>
              )}
            </div>
            {(hasChoresToday || rewardsButton) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 * k, marginTop: 18 * k }}>
                {hasChoresToday && (
                  <div style={{ flex: 1, height: 10 * k, background: 'var(--fcc-border-sub)', borderRadius: 5 * k, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--fcc-accent)', borderRadius: 5 * k, width: `${overallPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                )}
                {rewardsButton}
              </div>
            )}
            {byPerson && sectionCount > 0 && dayOffLine && <div style={{ marginTop: 14 * k }}>{dayOffLine}</div>}
          </div>
          {!byPerson && (
            <div style={{ padding: `${24 * k}px ${pad}px`, flexShrink: 0, borderBottom: '1px solid var(--fcc-border-sub)' }}>
              <MemberStrip members={activeMembers} dayOff={dayOffMembers} memberStats={memberStats} weekData={weekData} detail={chipDetail} c={chipScale} gap={14 * k} showStreaks={config.showStreaks} showPoints={config.showPoints} availableWidth={memberStripWidth} maxPerRow={3} />
            </div>
          )}
          {byPerson && <div style={{ height: 12 * k, flexShrink: 0 }} />}

          {bonusBand}
          {listGrid}
          {sectionCount === 0 && (
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{emptyState}</div>
          )}

          {weekBottom && (
            <div style={{ flexShrink: 0, margin: `0 ${pad}px`, borderTop: '1px solid var(--fcc-border-sub)' }}>{weekBottom}</div>
          )}
          {footer}
        </>
      )}

      {effectiveView === 'chores' && !historyVariant && bonusSheets}

      {/* Touch completion toasts — always rendered */}
      {/* With a sheet open the toasts go to the top, clear of its Cancel. */}
      {allowTouch && <ChoreToast toasts={toasts} onDismiss={dismissToast} onUndo={(id) => void handleUndo(id)} notice={overspentMessage} alert={bonusAlert} scale={tc} bottom={footer ? 96 * k : 20 * k} top={bonusSheet ? 20 * k : undefined} />}
    </div>
  );
}
