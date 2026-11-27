'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslate, type TranslateFn } from '@/i18n';
import {
  groupTouchSwitches,
  touchRowState,
  type TouchDisplayGroup,
  type TouchModuleGroup,
  type TouchRow,
  type TouchSwitch,
} from '@/lib/touch-all';
import { resolveModuleLabel } from '@/lib/module-registry';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Toggle from '@/components/ui/Toggle';
import { SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';

const K = 'settings.touchAll';

/** With this many rows or fewer every one is simply listed: no filter, no search, no scroll. */
export const TOUCH_LIST_SIMPLE_MAX = 8;

type Filter = 'some' | 'on' | 'off' | 'all';

function OnOffPair({ switches, name, onPick, testId }: { switches: readonly TouchSwitch[]; name: string; onPick: (on: boolean) => void; testId: string }) {
  const t = useTranslate('editor');
  const state = touchRowState(switches);
  return (
    <SegmentedControl<string>
      fit="content"
      className="shrink-0"
      label={t(`${K}.pairLabel`, { name })}
      value={state === 'some' ? '' : state}
      onChange={(v) => onPick(v === 'on')}
      options={[
        { value: 'on', label: t(`${K}.valueOn`), testId: `${testId}-on` },
        { value: 'off', label: t(`${K}.valueOff`), testId: `${testId}-off` },
      ]}
    />
  );
}

function Meter({ switches }: { switches: readonly TouchSwitch[] }) {
  const on = switches.filter((s) => s.on).length;
  return (
    <span aria-hidden className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-hs-card">
      <span className="block h-full bg-hs-accent" style={{ width: `${(on / Math.max(switches.length, 1)) * 100}%` }} />
    </span>
  );
}

function moduleHeading(mod: TouchModuleGroup, t: TranslateFn): { name: string; extra?: string } {
  const name = resolveModuleLabel(mod.type, t);
  return { name, extra: mod.title ?? (mod.number ? String(mod.number) : undefined) };
}

function SwitchLine({ item, parent, onFlip, t }: { item: TouchSwitch; parent?: TouchSwitch; onFlip: (item: TouchSwitch, on: boolean) => void; t: TranslateFn }) {
  const blocked = !!parent && !parent.on;
  return (
    <div className={parent ? 'py-1 pl-4' : 'py-1'} data-testid="touch-switch" data-key={item.key}>
      <Toggle
        label={blocked ? `${t(item.labelKey)} (${t(`${K}.needs`, { name: t(parent.labelKey) })})` : t(item.labelKey)}
        checked={item.on}
        disabled={blocked}
        onChange={(on) => onFlip(item, on)}
      />
    </div>
  );
}

function RowBody({ row, group, onFlip, t }: { row: TouchRow; group: TouchDisplayGroup; onFlip: (item: TouchSwitch, on: boolean) => void; t: TranslateFn }) {
  const byKey = new Map(row.switches.map((s) => [s.key, s]));
  const params = new URLSearchParams();
  if (row.screenId) params.set('screen', row.screenId);
  if (group.displayId) params.set('display', group.displayId);
  return (
    <div className="border-b border-hs-border bg-hs-accent-soft/30 py-2 pl-9 pr-3">
      {row.kind === 'display'
        ? row.switches.map((item) => <SwitchLine key={item.key} item={item} onFlip={onFlip} t={t} />)
        : row.modules.map((mod) => {
            const heading = moduleHeading(mod, t);
            return (
              <div key={mod.id} className="mb-1.5 last:mb-0">
                <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-hs-text-faint">
                  {heading.name}
                  {heading.extra && <span className="ml-1.5 normal-case tracking-normal">{heading.extra}</span>}
                </div>
                {mod.switches.map((item) => (
                  <SwitchLine key={item.key} item={item} parent={item.needsKey ? byKey.get(item.needsKey) : undefined} onFlip={onFlip} t={t} />
                ))}
              </div>
            );
          })}
      {row.kind === 'screen' && (
        <Link href={`/editor?${params.toString()}`} className="mt-1 inline-block text-[11px] text-hs-accent hover:text-hs-accent-hover">
          {t(`${K}.openInEditor`)}
        </Link>
      )}
    </div>
  );
}

interface TouchScreenListProps {
  switches: readonly TouchSwitch[];
  /** Draw a heading per display (the Screen page with several displays); a display's own page draws none. */
  showDisplays: boolean;
  /** Flip these switches at once; `undoName` asks for a toast that names what was flipped. */
  onFlip: (switches: readonly TouchSwitch[], on: boolean, undoName?: string) => void;
  /** A display's On / Off pair was pressed: ask first, the same as on its own page. */
  onAskDisplay: (displayId: string, on: boolean) => void;
}

/**
 * The Touch box's list: one row per screen with a count and an On / Off pair,
 * opening to that screen's single switches. A household with many screens
 * gets a filter (Mixed first: the screens with something to decide), a search
 * box and a list that scrolls on its own.
 */
export default function TouchScreenList({ switches, showDisplays, onFlip, onAskDisplay }: TouchScreenListProps) {
  const t = useTranslate('editor');
  const groups = useMemo(() => groupTouchSwitches(switches), [switches]);
  const allRows = groups.flatMap((g) => g.rows);
  const simple = allRows.length <= TOUCH_LIST_SIMPLE_MAX;

  const [filter, setFilter] = useState<Filter>('some');
  const [query, setQuery] = useState('');
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set());
  // Rows that were opened or flipped stay listed under the current filter,
  // so a screen never jumps away the moment it stops being mixed.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const firstMixed = groups.find((g) => g.rows.some((r) => touchRowState(r.switches) === 'some')) ?? groups[0];
  const [foldedDisplays, setFoldedDisplays] = useState<ReadonlySet<string>>(
    () => new Set(groups.filter((g) => g !== firstMixed).map((g) => g.displayId ?? '')),
  );

  const keep = (key: string) => setKept((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  const toggleIn = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };

  const counts = { some: 0, on: 0, off: 0, all: allRows.length };
  for (const row of allRows) counts[touchRowState(row.switches)]++;

  const needle = query.trim().toLowerCase();
  const matches = (row: TouchRow) => {
    if (!needle) return true;
    if (row.kind === 'display') return t(`${K}.rowDisplay`).toLowerCase().includes(needle);
    return (
      (row.screenName ?? '').toLowerCase().includes(needle) ||
      row.modules.some((m) => `${resolveModuleLabel(m.type, t)} ${m.title ?? ''}`.toLowerCase().includes(needle))
    );
  };
  const visible = (row: TouchRow) =>
    matches(row) && (simple || filter === 'all' || kept.has(row.key) || touchRowState(row.switches) === filter);

  const rowName = (row: TouchRow) => (row.kind === 'display' ? t(`${K}.rowDisplay`) : row.screenName ?? '');
  const shown = groups.map((group) => ({ group, rows: group.rows.filter(visible) }));
  const nothing = shown.every((g) => g.rows.length === 0);

  return (
    <div className="mt-3 border-t border-hs-border pt-3" data-testid="touch-list">
      {!simple && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <SegmentedControl<Filter>
            fit="content"
            label={t(`${K}.filterLabel`)}
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setKept(new Set());
            }}
            options={[
              { value: 'some', label: t(`${K}.filterSome`, { count: counts.some }), testId: 'touch-filter-some' },
              { value: 'on', label: t(`${K}.filterOn`, { count: counts.on }), testId: 'touch-filter-on' },
              { value: 'off', label: t(`${K}.filterOff`, { count: counts.off }), testId: 'touch-filter-off' },
              { value: 'all', label: t(`${K}.filterAll`, { count: counts.all }), testId: 'touch-filter-all' },
            ]}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('screenSearch.buttonAriaLabel')}
            aria-label={t('screenSearch.buttonAriaLabel')}
            data-testid="touch-search"
            className={`${SETTINGS_INPUT_SM_CLASS} ml-auto w-48 !py-1 !text-xs`}
          />
        </div>
      )}

      <div
        className={`overflow-hidden rounded-lg border border-hs-border bg-hs-body ${simple ? '' : 'max-h-[23.5rem] overflow-y-auto'}`}
        data-testid="touch-rows"
      >
        {nothing && <div className="px-3 py-3 text-xs text-hs-text-faint">{t(`${K}.noScreens`)}</div>}
        {shown.map(({ group, rows }) => {
          const id = group.displayId ?? '';
          const folded = showDisplays && foldedDisplays.has(id) && !needle;
          if (showDisplays && rows.length === 0 && needle) return null;
          const screens = group.rows.filter((r) => r.kind === 'screen').length;
          return (
            <div key={id}>
              {showDisplays && (
                <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-hs-border bg-hs-panel px-3 py-2">
                  <button
                    type="button"
                    aria-expanded={!folded}
                    onClick={() => setFoldedDisplays((prev) => toggleIn(prev, id))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-hs-text-primary"
                    data-testid={`touch-display-${id}`}
                  >
                    {folded ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hs-text-faint" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-hs-text-faint" />}
                    <span className="truncate">{group.displayName}</span>
                    <span className="shrink-0 text-[11px] font-normal text-hs-text-faint">
                      {t(`${K}.displayCount${screens === 1 ? 'One' : 'Other'}`, {
                        on: group.switches.filter((s) => s.on).length,
                        total: group.switches.length,
                        screens,
                      })}
                    </span>
                  </button>
                  <OnOffPair
                    switches={group.switches}
                    name={group.displayName ?? ''}
                    testId={`touch-display-${id}`}
                    onPick={(on) => onAskDisplay(id, on)}
                  />
                </div>
              )}
              {!folded &&
                rows.map((row) => {
                  const open = openRows.has(row.key);
                  const name = rowName(row);
                  return (
                    <div key={row.key} data-testid="touch-row" data-row={row.key} data-state={touchRowState(row.switches)}>
                      <div className={`flex items-center gap-2.5 border-b border-hs-border px-3 py-1.5 ${open ? 'bg-hs-accent-soft/60' : ''}`}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => {
                            setOpenRows((prev) => toggleIn(prev, row.key));
                            keep(row.key);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-hs-text-secondary hover:text-hs-text-primary"
                        >
                          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-hs-text-faint" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hs-text-faint" />}
                          <span className="truncate">{name}</span>
                        </button>
                        <Meter switches={row.switches} />
                        <span className="w-20 shrink-0 text-right text-[11px] text-hs-text-faint">
                          {t(`${K}.rowCount`, { on: row.switches.filter((s) => s.on).length, total: row.switches.length })}
                        </span>
                        <OnOffPair
                          switches={row.switches}
                          name={name}
                          testId="touch-row"
                          onPick={(on) => {
                            keep(row.key);
                            onFlip(row.switches, on, row.kind === 'screen' ? name : undefined);
                          }}
                        />
                      </div>
                      {open && (
                        <RowBody
                          row={row}
                          group={group}
                          t={t}
                          onFlip={(item, on) => {
                            keep(row.key);
                            onFlip([item], on);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
