'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ModuleStyle, NotesConfig, NotesFilter, NotesView } from '@/types/config';
import type { Note } from '@/types/notes';
import ModuleWrapper from '../ModuleWrapper';
import { ModuleEmptyState, ModuleNotUpdatingState } from '../ModuleStates';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useFetchData } from '@/hooks/useFetchData';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useRealClock } from '@/hooks/useTZClock';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { FETCH_KEY_REGISTRY, notesUrl } from '@/lib/fetch-keys';
import { arrangeNotes, isLive, isMaterialView, NOTES_TITLE_ROW_VIEWS } from '@/lib/notes-rules';
import { notesCardDraws } from '@/lib/notes-wall';
import { createDrawingRequest, deleteNoteRequest, sendNotesWrite } from '@/lib/notes-client';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import type { NoteSurface } from '@/lib/note-drawing';
import type { NoteDrawingLine } from '@/types/notes';
import { TAP_CHECKBOX_ACCENT } from '../shared/TapCheckbox';
import { NoteDrawDoor } from './NoteDrawDoor';
import { NoteDrawSheet, type NoteDrawPost } from './NoteDrawSheet';
import { NoteDrawingOverlay, NotePostedNotice } from './NoteDrawingOverlay';
import { forgetKeptDrawing, keepDrawing, useKeptDrawing } from './keptDrawing';
import { ageOf, authorOf } from './shared';
import { clampSetting, type NotesContext } from './shared';
import { ModuleTitleRow } from '../shared/ModuleTitleRow';
import { STEP_SECONDS } from './useStepper';
import { BoardView } from './BoardView';
import { CardsView } from './CardsView';
import { StickyView } from './StickyView';
import { BubblesView } from './BubblesView';
import { SpotlightView } from './SpotlightView';
import { CompactView } from './CompactView';
import { CountView } from './CountView';
import { StripView } from './StripView';
import { TickerView } from './TickerView';
import { TimelineView } from './TimelineView';
import { FocusView } from './FocusView';
import { ByPersonView } from './ByPersonView';
import { PinnedNewView } from './PinnedNewView';
import { LatestView } from './LatestView';
import { ChalkboardView } from './materials/ChalkboardView';
import { LetterboardView } from './materials/LetterboardView';
import { WhiteboardView } from './materials/WhiteboardView';
import { FridgeView } from './materials/FridgeView';
import { NotebookView } from './materials/NotebookView';
import { ReceiptView } from './materials/ReceiptView';
import { NeonView } from './materials/NeonView';
import { HeadlineView } from './materials/HeadlineView';
import { MATERIAL_SURFACE } from './materials/surface';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import type { TimeFormat } from '@/types/config';

interface NotesModuleProps {
  config: NotesConfig;
  style: ModuleStyle;
  /** The display's IANA timezone (Settings), applied to every module by buildModuleProps. */
  timezone?: string;
  /** The household's saved 12/24-hour choice, applied to every module the same way. */
  timeFormat?: TimeFormat;
  /** The card's address on a wall. Absent in the editor's canvas, where the card takes no touch. */
  screenId?: string;
  moduleId?: string;
}

/** The page a view's drawings are made on and drawn in: the whiteboard's marker, the chalkboard's chalk, paper, or the plain card. */
const VIEW_SURFACE: Partial<Record<NotesView, NoteSurface>> = {
  whiteboard: 'marker',
  chalkboard: 'chalk',
  fridge: 'paper',
  notebook: 'paper',
  receipt: 'paper',
  headline: 'paper',
};

type NotesPayload = { notes: Note[] };

/**
 * Fitted type per view. `height` is the share of the card's height each view
 * draws its base type at, about the mockup's 24px at the view's design size
 * (Board 440 x 520, Spotlight 640 x 320, Count 300 x 220, Strip and Ticker
 * 1000 x 120, and so on). `width` caps it by the card's width: at the design
 * size the height governs, but a card switched from Board to Strip or Count
 * without being resized would otherwise draw a single line 150px tall.
 */
const FIT: Record<NotesView, { height: number; width: number }> = {
  board: { height: 0.052, width: 0.075 },
  // Cards and Sticky change their column count with the width, so they take
  // Board's cap rather than a tighter one.
  cards: { height: 0.052, width: 0.075 },
  sticky: { height: 0.052, width: 0.075 },
  bubbles: { height: 0.052, width: 0.075 },
  timeline: { height: 0.052, width: 0.075 },
  'by-person': { height: 0.052, width: 0.075 },
  focus: { height: 0.066, width: 0.075 },
  'pinned-new': { height: 0.07, width: 0.033 },
  spotlight: { height: 0.09, width: 0.053 },
  compact: { height: 0.09, width: 0.075 },
  latest: { height: 0.09, width: 0.053 },
  count: { height: 0.14, width: 0.12 },
  strip: { height: 0.3, width: 0.04 },
  // The ticker scrolls, so its width barely limits it; the cap only stops a
  // tall card from drawing a giant crawl.
  ticker: { height: 0.3, width: 0.06 },
  // Materials measure the whole card (the wrapper's padding is zeroed for
  // them and the view pads itself), so their factors are Board's and
  // Spotlight's scaled by the padded box's share of the card at the design
  // size (about 0.88): the same 24px at 440 x 520 as the mockup.
  chalkboard: { height: 0.046, width: 0.066 },
  whiteboard: { height: 0.046, width: 0.066 },
  fridge: { height: 0.046, width: 0.066 },
  notebook: { height: 0.046, width: 0.066 },
  receipt: { height: 0.046, width: 0.066 },
  headline: { height: 0.046, width: 0.066 },
  letterboard: { height: 0.08, width: 0.055 },
  neon: { height: 0.08, width: 0.055 },
};

/** Views that draw at most `maxNotes` in wall order. Timeline and Pinned and new cap in their own order. */
const CAPPED_VIEWS: ReadonlySet<NotesView> = new Set(['board', 'cards', 'sticky', 'bubbles', 'compact', 'focus', 'chalkboard', 'whiteboard', 'fridge', 'notebook', 'receipt', 'headline']);
/** Views that show the whole board whatever the filter says. */
const WHOLE_BOARD_VIEWS: ReadonlySet<NotesView> = new Set(['timeline', 'by-person']);

const MAX_NOTES = { min: 1, max: 20, fallback: 5 } as const;
const TICKER_SPEED = { min: 3, max: 30, fallback: 8 } as const;

function resolveFilter(filter: unknown): NotesFilter {
  return filter === 'pinned' || filter === 'important' ? filter : 'all';
}

export default function NotesModule({ config, style, timezone, timeFormat: savedTimeFormat, screenId, moduleId }: NotesModuleProps) {
  const timeFormat = useHouseholdTimeFormat(savedTimeFormat);
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const view: NotesView = Object.hasOwn(FIT, config.view) ? config.view : 'board';
  // The width cap needs the card's shape, which the font hook measures: the
  // first measured render stores it and the next one applies it (the shape
  // does not depend on the type, so this settles at once).
  const [aspect, setAspect] = useState(0);
  const fit = FIT[view];
  const factor = aspect > 0 ? Math.min(fit.height, fit.width * aspect) : fit.height;
  const { containerRef, scaledFontSize, boxWidth, boxHeight } = useScaledFontSize(style, factor);
  const measuredAspect = boxHeight > 0 ? boxWidth / boxHeight : 0;
  if (Math.abs(measuredAspect - aspect) > 0.001) setAspect(measuredAspect);

  // Live notes only; the heartbeat follows this read on a wall, and the
  // editor canvas (no heartbeat) polls it on the registry's TTL.
  const [payload, fetchError] = useFetchData<NotesPayload>(notesUrl(), FETCH_KEY_REGISTRY.notes.ttlMs);
  const { members: roster } = useFamilyData();
  const members = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);
  // A real instant, not the zone-shifted clock: it is compared with each
  // note's `expiresAt`, so a note leaves the wall on the minute its time is
  // up without waiting for the file to change. The household zone is applied
  // where a day or weekday is named.
  const now = useRealClock(60_000);

  const filter = WHOLE_BOARD_VIEWS.has(view) ? 'all' : resolveFilter(config.filter);
  const max = clampSetting(config.maxNotes, MAX_NOTES.min, MAX_NOTES.max, MAX_NOTES.fallback);
  const capped = CAPPED_VIEWS.has(view);
  const arranged = useMemo(
    () => arrangeNotes(payload?.notes ?? [], now, { filter, max: capped ? max : undefined }),
    [payload, now, filter, max, capped],
  );

  // A touch wall: the card knows its own address. The editor's canvas does
  // not, and stays a picture.
  const onWall = !!screenId && !!moduleId;
  // The same rule the hub holds the wall to (`notesCardDraws`).
  // The editor's canvas draws the button too, as a picture: the card then
  // fits the same notes there as on the wall, and the switch visibly does something.
  const draws = notesCardDraws({ ...config, view });
  const surface: NoteSurface = VIEW_SURFACE[view] ?? 'card';
  const kept = useKeptDrawing();
  const [drawing, setDrawing] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ id: string; words: string; detail?: string; lines: NoteDrawingLine[] } | null>(null);
  const openDrawing = useCallback((note: Note) => setOpened(note.id), []);

  // What the hub answered is every note, gone ones too; the wall's read holds only the live ones.
  const showAnswer = useCallback((notes: Note[]) => {
    const at = new Date();
    displayCache.replace(notesUrl(), { notes: notes.filter((n) => isLive(n, at)) }, FETCH_KEY_REGISTRY.notes.ttlMs);
  }, []);
  const post = useCallback(async ({ drawing: lines, authorId, life }: NoteDrawPost) => {
    const fallback = t('notes.draw.failed');
    const { notes, created, madeRoom = 0 } = await sendNotesWrite(displayFetch, createDrawingRequest({ drawing: lines, authorId, life }), fallback);
    showAnswer(notes);
    forgetKeptDrawing();
    setDrawing(false);
    if (created) {
      const who = authorId ? roster.find((m) => m.id === authorId)?.name : undefined;
      setPosted({
        id: created.id,
        words: who ? t('notes.draw.posted', { name: who }) : t('notes.draw.postedNobody'),
        // The board was full of drawings: say that one came down, so nobody wonders where it went.
        detail: madeRoom > 0 ? t('notes.draw.madeRoom') : undefined,
        lines: lines.lines,
      });
    }
  }, [t, roster, showAnswer]);
  const undoPost = useCallback(async (id: string, lines: NoteDrawingLine[]) => {
    const { notes } = await sendNotesWrite(displayFetch, deleteNoteRequest(id), t('notes.draw.undoFailed'));
    showAnswer(notes);
    // Off the board, not thrown away: a child who taps Undo wants the page
    // back, the way Undo works while drawing. The button reads "Finish your
    // drawing" and opens on it.
    keepDrawing(lines);
  }, [t, showAnswer]);

  const overlays = (
    <>
      {drawing && (
        <NoteDrawSheet
          surface={surface}
          accent={TAP_CHECKBOX_ACCENT}
          members={roster}
          startWith={kept ?? undefined}
          onPost={post}
          onClose={(page) => {
            if (page) keepDrawing(page);
            else forgetKeptDrawing();
            setDrawing(false);
          }}
        />
      )}
      {posted && (
        <NotePostedNotice key={posted.id} words={posted.words} detail={posted.detail} onUndo={() => undoPost(posted.id, posted.lines)} onDone={() => setPosted(null)} />
      )}
    </>
  );
  const door = draws
    ? { label: t(kept ? 'notes.draw.rowFinish' : 'notes.draw.row'), onPress: () => { if (!onWall) return; setPosted(null); setDrawing(true); } }
    : undefined;

  // First fetch still in flight: a plain card, never a crash.
  if (!payload && !fetchError) {
    return (
      <ModuleWrapper style={style}>
        <div ref={containerRef} className="h-full" />
      </ModuleWrapper>
    );
  }
  // The first read failed: say so, not "No notes", which would be a guess.
  if (!payload) return <ModuleNotUpdatingState style={style} error={fetchError} />;

  const emptyMessage = filter === 'pinned'
    ? t('notes.emptyPinned')
    : filter === 'important'
      ? t('notes.emptyImportant')
      : t('notes.empty');

  // Count still says 0: a tile that says nothing is up is still information.
  // An empty board draws the ordinary card for every view: a material has
  // nothing to paint without notes, and its ink on a bare surface is
  // invisible on a dark wall.
  if (arranged.all.length === 0 && view !== 'count') {
    // An empty board on a wall that draws still offers the button: the first
    // note can be a drawing.
    if (!door) return <ModuleEmptyState style={style} type="notes" message={emptyMessage} />;
    return (
      <ModuleWrapper style={style}>
        <div ref={containerRef} data-testid="notes-empty-draw" data-view={view} className="flex flex-col h-full min-h-0 overflow-hidden" style={{ fontSize: `${scaledFontSize}px`, lineHeight: 1.2 }}>
          <div className="flex flex-1 min-h-0 items-center justify-center text-center" style={{ fontSize: '0.8em', opacity: 0.6, padding: '0 0.5em' }}>
            {filter === 'all' ? t('notes.emptyDraw') : emptyMessage}
          </div>
          <NoteDrawDoor label={door.label} accent={TAP_CHECKBOX_ACCENT} onPress={door.onPress} />
        </div>
        {overlays}
      </ModuleWrapper>
    );
  }

  const ctx: NotesContext = {
    members,
    showAuthor: config.showAuthor !== false,
    showAge: config.showAge !== false,
    now,
    locale,
    timezone,
    timeFormat,
    t,
    fontPx: scaledFontSize,
    onOpenDrawing: onWall ? openDrawing : undefined,
  };
  const stepSeconds = clampSetting(config.stepSeconds, STEP_SECONDS.min, STEP_SECONDS.max, STEP_SECONDS.fallback);
  const { all, shown, hidden } = arranged;
  const title = config.title?.trim() || t('notes.defaultTitle');
  const showTitle = config.showTitle !== false;
  // What every material view takes: the surface is the card, so it also
  // gets the card's padding and the width to lay out against.
  const material = { ctx, all, shown, hidden, max, stepSeconds, title, heading: config.title?.trim() ?? '', showTitle, padding: style.padding, width: boxWidth, height: boxHeight, door };

  let body: ReactNode;
  switch (view) {
    case 'cards': body = <CardsView ctx={ctx} shown={shown} hidden={hidden} width={boxWidth} />; break;
    case 'sticky': body = <StickyView ctx={ctx} shown={shown} hidden={hidden} width={boxWidth} />; break;
    case 'bubbles': body = <BubblesView ctx={ctx} shown={shown} hidden={hidden} />; break;
    case 'spotlight': body = <SpotlightView ctx={ctx} all={all} stepSeconds={stepSeconds} />; break;
    case 'compact': body = <CompactView ctx={ctx} shown={shown} hidden={hidden} />; break;
    case 'count': body = <CountView ctx={ctx} all={all} emptyMessage={emptyMessage} />; break;
    case 'strip': body = <StripView ctx={ctx} all={all} stepSeconds={stepSeconds} />; break;
    case 'ticker': {
      const speed = clampSetting(config.tickerSpeed, TICKER_SPEED.min, TICKER_SPEED.max, TICKER_SPEED.fallback);
      body = <TickerView ctx={ctx} all={all} speed={speed} />;
      break;
    }
    case 'timeline': body = <TimelineView ctx={ctx} all={all} max={max} />; break;
    case 'focus': body = <FocusView ctx={ctx} all={all} shown={shown} />; break;
    case 'by-person': body = <ByPersonView ctx={ctx} all={all} roster={roster} />; break;
    case 'pinned-new': body = <PinnedNewView ctx={ctx} all={all} max={max} />; break;
    case 'latest': body = <LatestView ctx={ctx} all={all} />; break;
    case 'chalkboard': body = <ChalkboardView {...material} />; break;
    case 'letterboard': body = <LetterboardView {...material} />; break;
    case 'whiteboard': body = <WhiteboardView {...material} />; break;
    case 'fridge': body = <FridgeView {...material} />; break;
    case 'notebook': body = <NotebookView {...material} />; break;
    case 'receipt': body = <ReceiptView {...material} />; break;
    case 'neon': body = <NeonView {...material} />; break;
    case 'headline': body = <HeadlineView {...material} />; break;
    default: body = <BoardView ctx={ctx} shown={shown} hidden={hidden} />;
  }

  const count = all.length;
  // The drawing opened large, while its note is still on the wall.
  const openedNote = opened ? all.find((n) => n.id === opened && n.drawing) : undefined;
  // A material is its own card: the wrapper draws no surface, border, blur
  // or padding of its own and takes the material's ink and face, the way the
  // Sticky Note module replaces its paper. Radius, opacity and shadow stay.
  const wrapperStyle: ModuleStyle = isMaterialView(view)
    ? { ...style, ...MATERIAL_SURFACE[view as keyof typeof MATERIAL_SURFACE], borderWidth: 0, backdropBlur: 0, padding: 0 }
    : style;
  return (
    <ModuleWrapper style={wrapperStyle}>
      <div
        ref={containerRef}
        data-testid="notes-module"
        data-view={view}
        className="flex flex-col h-full min-h-0 overflow-hidden"
        // Normal line height, as the mockup draws: the page's 1.5 would make
        // every metadata line and one-line row half as tall again and push
        // notes into "and N more" for nothing.
        style={{ fontSize: `${scaledFontSize}px`, lineHeight: 1.2 }}
      >
        {NOTES_TITLE_ROW_VIEWS.has(view) && (
          <ModuleTitleRow
            title={config.showTitle !== false ? config.title?.trim() || t('notes.defaultTitle') : undefined}
            // Compact keeps its header short: the bare number.
            right={view === 'compact' ? count : t('notes.count', { count })}
          />
        )}
        {body}
        {door && !isMaterialView(view) && <NoteDrawDoor label={door.label} accent={TAP_CHECKBOX_ACCENT} onPress={door.onPress} />}
      </div>
      {overlays}
      {openedNote && (
        <NoteDrawingOverlay
          note={openedNote}
          author={authorOf(openedNote, members, t)}
          age={ageOf(openedNote, ctx)}
          surface={surface}
          accent={TAP_CHECKBOX_ACCENT}
          onClose={() => setOpened(null)}
        />
      )}
    </ModuleWrapper>
  );
}
