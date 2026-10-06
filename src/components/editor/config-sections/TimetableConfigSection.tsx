'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Users } from 'lucide-react';
import clsx from 'clsx';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import SegmentedControl, { type SegmentedOption } from '@/components/ui/SegmentedControl';
import Toggle from '@/components/ui/Toggle';
import TimetableModal from '@/components/editor/timetable-modal';
import { useEditorData } from '@/hooks/useEditorData';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { timetablesUrl } from '@/lib/fetch-keys';
import { settingsPath } from '@/lib/settings-route';
import { useTranslate } from '@/i18n';
import type { TimetableData } from '@/types/timetables';
import type {
  ModuleInstance,
  TimetableConfig,
  TimetableDetail,
  TimetableLayout,
  TimetableView,
} from '@/types/config';
import { DEFAULT_TOMORROW_FROM } from '@/lib/timetable-day';

const FAMILY_PAGE = settingsPath({ kind: 'defaults', page: 'family' });

/**
 * How tall one person's row stands: 6px of padding above and below, the 16px
 * name line, the 15px class line under it, and the 1px divider.
 */
const MEMBER_ROW_HEIGHT = 44;

/**
 * How many rows stay in view before the list scrolls.
 *
 * A household of five children and two grown-ups is seven or eight rows. Four
 * of them fitted before, which left most of the family out of sight behind a
 * half-drawn row.
 */
const MEMBER_ROWS_IN_VIEW = 6;

/**
 * The list's own height: six rows, plus the 1px border it draws above and
 * below them, which a max height counts inside itself.
 */
const MEMBER_LIST_HEIGHT = MEMBER_ROW_HEIGHT * MEMBER_ROWS_IN_VIEW + 2;

/**
 * What the rows are painted on, worked out rather than named: the list carries
 * a 60% card tint over the panel, and the fades at its edges have to be that
 * exact colour or they show an edge of their own.
 */
const MEMBER_LIST_BACKGROUND = 'color-mix(in srgb, var(--hs-bg-card) 60%, var(--hs-bg-panel))';

/**
 * Both edge fades, which differ only in which edge they sit on. Deep enough to
 * wash out the lower line of the row it lies over, so the list reads as cut
 * off rather than finished, and no deeper: a fade over the name and the tick
 * box makes that row look switched off instead.
 */
const EDGE_FADE = 'pointer-events-none absolute inset-x-px h-7 transition-opacity';

export function TimetableConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  // The caption over the list of names is the list's own name, so the tick
  // boxes are read as one group rather than as loose checkboxes.
  const showLabelId = useId();
  const { config: c, set } = useModuleConfig<Partial<TimetableConfig>>(mod, screenId);
  const { members } = useFamilyData();

  // Which timetable window to open, and on whom: null while it is closed, and
  // an empty object for "open it wherever it was last".
  const [windowFor, setWindowFor] = useState<{ memberId?: string } | null>(null);

  const { data: saved, refetch } = useEditorData<{ data: TimetableData }>(timetablesUrl());

  // A window session can add or remove a timetable, so the list of who has one
  // is read again once it closes. The hook already loads on mount, so skipping
  // this effect's first run keeps mount at a single request.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    if (!windowFor) refetch();
  }, [windowFor, refetch]);

  // A timetable with no class name still counts as one, so membership is the
  // question here and the name is only what the row prints.
  const classNames = new Map(
    (saved?.data?.timetables ?? []).map((timetable) => [timetable.memberId, timetable.className ?? '']),
  );
  const chosen = new Set(c.memberIds ?? []);
  const hasFamily = members.length > 0;

  const VIEWS: SegmentedOption<TimetableView>[] = [
    { value: 'week', label: t('configSections.timetable.viewWeek') },
    { value: 'day', label: t('configSections.timetable.viewDay') },
  ];
  const view: TimetableView = c.view ?? 'week';

  const LAYOUTS: SegmentedOption<TimetableLayout>[] = [
    { value: 'side-by-side', label: t('configSections.timetable.layoutSideBySide') },
    { value: 'stacked', label: t('configSections.timetable.layoutStacked') },
  ];

  const DETAILS: SegmentedOption<TimetableDetail>[] = [
    { value: 'less', label: t('configSections.timetable.detailLess') },
    { value: 'some', label: t('configSections.timetable.detailSome') },
    { value: 'more', label: t('configSections.timetable.detailMore') },
  ];

  // Whether the list has more above or below what is on screen. On macOS the
  // scrollbar shows itself only while it is moving, so a list that ends flush
  // on a full row reads as the whole household: the fades are what say
  // otherwise. Re-read when the roster changes as well as on scroll, because
  // a seventh person makes the list scrollable without changing its own size,
  // which is the only thing the observer would see.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sync = () => {
      const furthest = list.scrollHeight - list.clientHeight;
      setMore({
        above: list.scrollTop > 4,
        below: furthest > 4 && list.scrollTop < furthest - 4,
      });
    };
    sync();
    list.addEventListener('scroll', sync, { passive: true });
    // The panel's own width changes with the editor window, which can turn a
    // name from one line into a truncation and nothing else, so the observer
    // is a refinement rather than the mechanism.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(list);
    return () => {
      observer?.disconnect();
      list.removeEventListener('scroll', sync);
    };
  }, [members.length]);

  const toggleMember = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id); else next.delete(id);
    // Rebuilt from the roster, which does two things: the cards follow
    // Settings > Family, so moving somebody up there moves their card without
    // another edit here, and somebody who has since left the household drops
    // out. Their id is otherwise stuck in the list forever, with no row to
    // untick it from, because only people who exist get a row.
    set({ memberIds: members.filter((member) => next.has(member.id)).map((member) => member.id) });
  };

  return (
    <div className="space-y-2">
      <p id={showLabelId} className="text-xs text-hs-text-muted">{t('configSections.timetable.show')}</p>

      {hasFamily ? (
        <>
          {/* Capped height so a household of five or more still leaves the
              rest of the panel in reach, with a fade at whichever edge the
              list carries on past. Same affordance the screen-tab strip uses
              on its own scroller. */}
          <div className="relative">
            <div
              ref={listRef}
              role="group"
              aria-labelledby={showLabelId}
              className="overflow-y-auto rounded-md border border-hs-border-strong bg-hs-card/60"
              style={{ maxHeight: MEMBER_LIST_HEIGHT }}
            >
              {members.map((member) => {
                const hasTimetable = classNames.has(member.id);
                const showing = hasTimetable && chosen.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 border-b border-hs-border px-2 py-1.5 last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase"
                      style={{ backgroundColor: `${member.color}25`, color: member.color }}
                    >
                      {member.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          'block truncate text-xs',
                          showing ? 'text-hs-text-body' : 'text-hs-text-faint',
                        )}
                      >
                        {member.name}
                      </span>
                      <span className="block truncate text-[10px] text-hs-text-faint">
                        {hasTimetable
                          ? classNames.get(member.id)
                          : t('configSections.timetable.noTimetable')}
                      </span>
                    </span>
                    {hasTimetable ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-hs-accent"
                        checked={chosen.has(member.id)}
                        aria-label={t('configSections.timetable.showMember', { name: member.name })}
                        onChange={(event) => toggleMember(member.id, event.target.checked)}
                      />
                    ) : (
                      <button
                        type="button"
                        aria-label={t('configSections.timetable.addFor', { name: member.name })}
                        aria-haspopup="dialog"
                        aria-expanded={windowFor?.memberId === member.id}
                        onClick={() => setWindowFor({ memberId: member.id })}
                        className="shrink-0 text-[11px] font-medium text-hs-accent hover:text-hs-accent-hover"
                      >
                        {t('configSections.timetable.add')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Painted in the list's own colour so the fade has no edge of
                its own, and inside the border rather than over it. */}
            <div
              aria-hidden="true"
              className={clsx(EDGE_FADE, 'top-px rounded-t-md', more.above ? 'opacity-100' : 'opacity-0')}
              style={{ background: `linear-gradient(to bottom, ${MEMBER_LIST_BACKGROUND}, transparent)` }}
            />
            <div
              aria-hidden="true"
              className={clsx(EDGE_FADE, 'bottom-px rounded-b-md', more.below ? 'opacity-100' : 'opacity-0')}
              style={{ background: `linear-gradient(to top, ${MEMBER_LIST_BACKGROUND}, transparent)` }}
            />
          </div>

          {/* The picker looks like it is building an order and is not: one place
              decides who stands where, and it is the family list. */}
          {chosen.size > 1 && (
            <p className="text-[11px] text-hs-text-faint">{t('configSections.timetable.cardOrder')}</p>
          )}

          <p className="flex items-center gap-1.5 text-[11px] text-hs-text-faint">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('configSections.timetable.fromFamily')}</span>
            <span aria-hidden="true">&middot;</span>
            <Link href={FAMILY_PAGE} className="text-hs-accent underline hover:text-hs-accent-hover">
              {t('configSections.timetable.manageFamily')}
            </Link>
          </p>
        </>
      ) : (
        <div className="rounded-md border border-dashed border-hs-border-strong px-3 py-3 text-center">
          <Users className="mx-auto h-5 w-5 text-hs-text-faint" aria-hidden="true" />
          <p className="mt-1.5 text-[11px] leading-relaxed text-hs-text-muted">
            {t('configSections.timetable.noFamily')}
          </p>
          <Link
            href={FAMILY_PAGE}
            className="mt-2 inline-block rounded-md bg-hs-accent px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-hs-accent-hover"
          >
            {t('configSections.timetable.openFamily')}
          </Link>
        </div>
      )}

      <Button
        variant="primary"
        className="inline-flex w-full items-center justify-center gap-1.5 text-xs"
        disabled={!hasFamily}
        aria-haspopup="dialog"
        aria-expanded={windowFor !== null}
        onClick={() => setWindowFor({})}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        {t('configSections.timetable.editTimetables')}
      </Button>

      {windowFor && (
        <TimetableModal memberId={windowFor.memberId} onClose={() => setWindowFor(null)} />
      )}

      <div className="space-y-1">
        <LabeledField label={t('configSections.timetable.view')} as="div">
          <SegmentedControl
            label={t('configSections.timetable.view')}
            value={view}
            onChange={(next) => set({ view: next })}
            options={VIEWS}
            disabled={!hasFamily}
          />
        </LabeledField>
        <p className="text-[11px] leading-relaxed text-hs-text-faint">
          {t('configSections.timetable.viewHelp')}
        </p>
      </div>

      <div className="space-y-1">
        <LabeledField label={t('configSections.timetable.layout')} as="div">
          <SegmentedControl
            label={t('configSections.timetable.layout')}
            value={c.layout ?? 'side-by-side'}
            onChange={(layout) => set({ layout })}
            options={LAYOUTS}
            disabled={!hasFamily}
          />
        </LabeledField>
        {/* In the Day view the two layouts are rows and columns rather than
            two arrangements of week cards, so the line under the control
            says which is which. */}
        {view === 'day' && (
          <p className="text-[11px] leading-relaxed text-hs-text-faint">
            {t('configSections.timetable.layoutHelpDay')}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <LabeledField label={t('configSections.timetable.detail')} as="div">
          <SegmentedControl
            label={t('configSections.timetable.detail')}
            value={c.detail ?? 'some'}
            onChange={(detail) => set({ detail })}
            options={DETAILS}
            disabled={!hasFamily}
          />
        </LabeledField>
        {/* Static wording: how much fits in a cell is the household's choice,
            and the module never swaps it to suit the box. */}
        <p className="text-[11px] leading-relaxed text-hs-text-faint">
          {t('configSections.timetable.detailHelp')}
        </p>
      </div>

      {/* Settings that do nothing in the current view are hidden rather than
          greyed out: a switch that never changes the wall is a puzzle. */}
      {view === 'week' && (
        <>
          <Toggle
            label={t('configSections.timetable.showStartTimes')}
            checked={c.showStartTimes ?? true}
            onChange={(showStartTimes) => set({ showStartTimes })}
            disabled={!hasFamily}
          />
          <Toggle
            label={t('configSections.timetable.nextWeekFromFriday')}
            checked={c.nextWeekFromFriday ?? true}
            onChange={(nextWeekFromFriday) => set({ nextWeekFromFriday })}
            disabled={!hasFamily}
          />
        </>
      )}
      {view === 'day' && (
        <div className="space-y-1">
          <LabeledField label={t('configSections.timetable.tomorrowFrom')}>
            <input
              type="time"
              value={c.tomorrowFrom ?? DEFAULT_TOMORROW_FROM}
              onChange={(event) => set({ tomorrowFrom: event.target.value || DEFAULT_TOMORROW_FROM })}
              disabled={!hasFamily}
              className="w-full rounded-md border border-hs-border-strong bg-hs-card/60 px-2 py-1 text-xs tabular-nums text-hs-text-body"
            />
          </LabeledField>
          <p className="text-[11px] leading-relaxed text-hs-text-faint">
            {t('configSections.timetable.tomorrowFromHelp')}
          </p>
          <Toggle
            label={t('configSections.timetable.showNowLine')}
            checked={c.showNowLine ?? true}
            onChange={(showNowLine) => set({ showNowLine })}
            disabled={!hasFamily}
          />
        </div>
      )}
      {/* No heading controls here: the one picker at the top of Module
          settings owns both the card title and this module's own heading, and
          a second switch over the same two fields did nothing whenever a card
          title was set, because the card title is what the module draws. */}
    </div>
  );
}
