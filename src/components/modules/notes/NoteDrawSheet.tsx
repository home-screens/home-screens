'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Pencil, Trash2, Undo2, X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { RefusalError } from '@/lib/refusal';
import { HubUnreachableError } from '@/lib/hub-request';
import { wallTakesTouch } from '@/lib/wall-touch-gate';
import { NOTE_PAGE_LOOKS, WALL_DRAWING_LIVES, pageInkColor, type NoteSurface } from '@/lib/note-drawing';
import { DEFAULT_NOTE_LIFE, NOTE_INKS, type NoteDrawing, type NoteDrawingLine, type NoteInk, type NoteLife } from '@/types/notes';
import type { FamilyMember } from '@/types/family';
import { NoteDrawingArt } from '@/components/notes/NoteDrawingArt';
import { useWallOverlayScale } from '../shared/useWallOverlayScale';
import { WallButton, type WallButtonProps } from '../shared/WallButton';
import { WallNotice } from '../shared/WallNotice';
import { WallOverlay } from '../shared/WallOverlay';
import { wallTypingVars } from '../shared/wallTypingVars';
import { useSettling, useSheetTapGuard } from '@/hooks/useSheetTapGuard';
import { DrawPage } from './DrawPage';

/** The sheet's own colours: the charcoal every card's sheet on the wall uses. */
const SHEET_THEME = getThemeTokens('charcoal');
const SERIF = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";

/** How long the sheet waits with nobody touching it. Longer than a typing sheet: a child stops to think. */
export const NOTE_DRAW_IDLE_MS = 120_000;

/** Set on the page's root while the drawing sheet is open; globals.css rests every card's glass under it. */
export const WALL_DRAWING_ATTRIBUTE = 'data-wall-drawing';

/** The sheet as authored, in 1080-wide pixels: portrait rises from the bottom, landscape sits in the middle. */
const PORTRAIT = { width: 1000, height: 1210, page: 912 } as const;
const LANDSCAPE = { width: 1540, height: 960, page: 1000 } as const;

export interface NoteDrawPost {
  drawing: NoteDrawing;
  /** Null for "Nobody". */
  authorId: string | null;
  life: NoteLife;
}

export interface NoteDrawSheetProps {
  /** Whose page: a plain card's dark one, the whiteboard's, the chalkboard's, or paper. */
  surface: NoteSurface;
  /** The card's accent: the stripe, the picked pen and the buttons that go on. */
  accent: string;
  /** The family, in its own order. */
  members: readonly FamilyMember[];
  /** A page left unfinished a few minutes ago, to carry on with. */
  startWith?: readonly NoteDrawingLine[];
  /** Put it on the board. Throws when the hub refused or did not answer; the sheet stays open with the drawing. */
  onPost: (post: NoteDrawPost) => Promise<void>;
  /** Closed without posting. `kept` holds the page when nobody chose to throw it away (the sheet timed out). */
  onClose: (kept: NoteDrawingLine[] | null) => void;
}

type Px = (n: number) => number;

/** How far a finger may wander between landing on a button and lifting, and still be a tap (CSS pixels). */
const TAP_SLOP_PX = 30;
/** A click this soon after the finger's own tap is the same tap told twice. */
const SAME_TAP_MS = 700;

/**
 * A button of the drawing sheet. It answers the finger itself (down and up
 * on the button), not only the browser's click: a browser makes no click
 * for a tap while another finger is on the screen, and here another finger
 * usually is, drawing. Without this a child could not change colour while a
 * sibling drew. A mouse, the keyboard and a screen reader still come through
 * the click.
 */
function SheetButton({ onPress, disabled, ...rest }: Omit<WallButtonProps, 'onClick'> & { onPress: () => void }) {
  const down = useRef<{ id: number; x: number; y: number } | null>(null);
  const tappedAt = useRef(-Infinity);
  return (
    <WallButton
      {...rest}
      disabled={disabled}
      onPointerDown={(e) => {
        // `:disabled` also covers the moment after the sheet opens, when the overlay holds every button still.
        // A touch that only wakes the wall presses nothing (the shell holds back its click the same way).
        down.current = e.pointerType === 'mouse' || e.currentTarget.matches(':disabled') || !wallTakesTouch() ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = down.current;
        down.current = null;
        if (!start || start.id !== e.pointerId || e.currentTarget.matches(':disabled')) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
        tappedAt.current = performance.now();
        onPress();
      }}
      onPointerCancel={() => { down.current = null; }}
      onClick={() => {
        if (performance.now() - tappedAt.current < SAME_TAP_MS) return;
        onPress();
      }}
    />
  );
}

function label(Q: Px): CSSProperties {
  return { fontSize: Q(22), fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wt-text-3)' };
}

function pill(Q: Px, { filled = false, off = false, tall = false }: { filled?: boolean; off?: boolean; tall?: boolean } = {}): CSSProperties {
  const h = tall ? 96 : 84;
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: Q(12), height: Q(h), padding: `0 ${Q(filled ? 48 : 34)}px`,
    borderRadius: Q(h / 2), flexShrink: 0, font: 'inherit', fontSize: Q(tall ? 31 : 28), fontWeight: filled ? 700 : 650, whiteSpace: 'nowrap',
    background: filled ? 'var(--wt-accent)' : 'var(--wt-bg)', color: filled ? 'var(--wt-on-accent)' : 'var(--wt-text)',
    border: `${Q(2)}px solid ${filled ? 'transparent' : 'var(--wt-border)'}`, cursor: off ? 'default' : 'pointer', opacity: off ? 0.38 : 1,
  };
}

/**
 * "Draw a note": the sheet a Notes card opens on a touch wall. Step one is
 * the page and the pens (six colours, a thin and a thick pen, Undo, Start
 * over). Step two asks who drew it and how long it stays, then puts it on
 * the board. The sheet is one size in every state, so nothing moves under a
 * finger, and only its own buttons close it: a hand brushing the dark part
 * must not throw a drawing away. Left alone it closes and hands the page
 * back to the card, which keeps it for a while.
 */
export function NoteDrawSheet({ surface, accent, members, startWith, onPost, onClose }: NoteDrawSheetProps) {
  const t = useTranslate('modules');
  const { w, h, P, landscape } = useWallOverlayScale();
  const shape = landscape ? LANDSCAPE : PORTRAIT;
  // A window too small for the sheet as authored draws the whole thing smaller, never a scrolling page.
  const fit = Math.min(1, (w * 0.98) / P(shape.width), (h * 0.97) / P(shape.height));
  const Q: Px = (n) => P(n) * fit;

  const [lines, setLines] = useState<NoteDrawingLine[]>(() => (startWith ? [...startWith] : []));
  // The pages Start over emptied, newest last. Undo walks back through the
  // lines drawn since and then brings the page before it back, so Start over
  // is never the end of a drawing.
  const [cleared, setCleared] = useState<NoteDrawingLine[][]>([]);
  const [ink, setInk] = useState<NoteInk>('ink');
  const [pen, setPen] = useState<0 | 1>(0);
  const [full, setFull] = useState(false);
  const [step, setStep] = useState<'draw' | 'who'>('draw');
  const [asking, setAsking] = useState(false);
  const [authorId, setAuthorId] = useState<string | null | undefined>(undefined);
  const [life, setLife] = useState<NoteLife>(DEFAULT_NOTE_LIFE);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busyRef = useRef(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const clearedRef = useRef(cleared);
  clearedRef.current = cleared;

  // While the page is open the frosted cards behind it rest their glass
  // (`[data-wall-drawing]` in globals.css): every new piece of a line redraws
  // the wall, and re-blurring the cards under the shade held a Pi 4 to seven
  // frames a second, so the line trailed the finger.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(WALL_DRAWING_ATTRIBUTE, '');
    return () => root.removeAttribute(WALL_DRAWING_ATTRIBUTE);
  }, []);

  // The buttons act when the finger lifts, before the browser's own click
  // for that tap. When that closes the sheet ("Throw it away", Close on an
  // empty page, a drawing going up), the click and the second tap of a double
  // tap would land on the wall underneath, where the card's own "Draw a
  // note" button often sits, and open the sheet again.
  useSheetTapGuard();

  const addLine = useCallback((line: NoteDrawingLine) => {
    setLines((current) => [...current, line]);
  }, []);
  const undo = () => {
    setFull(false);
    if (lines.length > 0) {
      setLines(lines.slice(0, -1));
    } else if (cleared.length > 0) {
      setLines(cleared[cleared.length - 1]);
      setCleared(cleared.slice(0, -1));
    }
  };
  const startOver = () => {
    if (lines.length === 0) return;
    setFull(false);
    setCleared([...cleared, lines]);
    setLines([]);
  };
  const close = () => {
    if (busyRef.current) return;
    if (lines.length === 0) {
      onClose(null);
      return;
    }
    // From "Who drew it?" too: back to the page, with the question over its pens.
    setStep('draw');
    setAsking(true);
  };
  // Somebody picked and then removed from the family (on a phone, while the
  // sheet was open) is nobody picked: their tile is gone, and the hub would
  // turn the drawing down for naming them.
  const picked = authorId != null && !members.some((m) => m.id === authorId) ? undefined : authorId;
  const post = async () => {
    if (busyRef.current || picked === undefined || lines.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await onPost({ drawing: { lines }, authorId: picked, life });
    } catch (err) {
      if (err instanceof RefusalError && err.code === 'family.memberRemoved') {
        // The hub knows before this wall's family list does: ask again rather than offer a retry that cannot work.
        setAuthorId(undefined);
        setProblem(t('notes.draw.pickAgain'));
      } else {
        // "Isn't answering" only when nothing came back; a hub that answered with a failure is there.
        const unreachable = err instanceof HubUnreachableError || err instanceof TypeError
          || (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError'));
        setProblem(
          err instanceof RefusalError && err.code === 'notes.wallDrawOff' ? t('notes.draw.off')
            : unreachable ? t('notes.draw.unreachable')
              : t('notes.draw.failed'),
        );
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // The sheet's buttons change in place (Next becomes "Put it on the board"
  // on the very same spot, the pens become a question): for a double tap's
  // length after each change they take no taps, so the second tap of a double
  // tap never lands on what just appeared under the finger.
  const settling = useSettling(`${step}:${asking}`);

  const has = lines.length > 0;
  const canUndo = has || cleared.length > 0;
  const pageWidth = Q(shape.page);
  const pageHeight = pageWidth * 0.75;
  const look = NOTE_PAGE_LOOKS[surface];

  const closeButton = (
    <SheetButton
      data-testid="note-draw-close"
      onPress={close}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: Q(10), height: Q(66), padding: `0 ${Q(28)}px`, borderRadius: Q(33),
        border: `${Q(2)}px solid var(--wt-border)`, background: 'transparent', color: 'var(--wt-text)', font: 'inherit',
        fontSize: Q(25), fontWeight: 600, cursor: 'pointer', flexShrink: 0,
      }}
    >
      <X size={Q(26)} strokeWidth={2.6} aria-hidden="true" />
      {t('wallKeyboard.close')}
    </SheetButton>
  );
  const heading = (kicker: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: Q(16) }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...label(Q), fontWeight: 600, letterSpacing: '0.16em' }}>{kicker}</div>
        <div style={{ fontFamily: SERIF, fontSize: Q(landscape ? 50 : 58), lineHeight: 1.1, marginTop: Q(landscape ? 4 : 8) }}>{title}</div>
      </div>
      {closeButton}
    </div>
  );

  const page = (
    <div
      data-testid="note-draw-canvas"
      data-lines={lines.length}
      style={{
        position: 'relative', width: pageWidth, height: pageHeight, flexShrink: 0, borderRadius: Q(28), background: look.background,
        boxShadow: asking
          ? `0 0 0 ${Q(2)}px var(--wt-border)`
          : `0 0 0 ${Q(2)}px var(--wt-accent), 0 0 0 ${Q(8)}px color-mix(in srgb, var(--wt-accent) 22%, transparent)`,
      }}
    >
      <DrawPage
        lines={lines}
        ink={ink}
        pen={pen}
        surface={surface}
        width={pageWidth}
        height={pageHeight}
        radius={Q(28)}
        onLine={addLine}
        onFull={() => setFull(true)}
        label={t('notes.draw.title')}
      />
      {!has && cleared.length === 0 && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: Q(20),
            fontSize: Q(36), color: `color-mix(in srgb, ${look.ink} 45%, transparent)`, pointerEvents: 'none',
          }}
        >
          <Pencil size={Q(64)} strokeWidth={1.6} aria-hidden="true" />
          {t('notes.draw.hint')}
        </div>
      )}
      {full && (
        <div
          role="status"
          data-testid="note-draw-full"
          style={{
            position: 'absolute', left: '50%', top: Q(20), transform: 'translateX(-50%)', padding: `${Q(12)}px ${Q(28)}px`, borderRadius: Q(30),
            background: 'var(--wt-surface)', color: 'var(--wt-text)', border: `${Q(2)}px solid var(--wt-border)`, fontSize: Q(26), fontWeight: 600,
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          {t('notes.draw.full')}
        </div>
      )}
    </div>
  );

  const dots = NOTE_INKS.map((key) => (
    <SheetButton
      key={key}
      data-testid={`note-draw-ink-${key}`}
      aria-label={t(`notes.draw.inks.${key}`)}
      aria-pressed={ink === key}
      onPress={() => setInk(key)}
      style={{
        width: Q(84), height: Q(84), borderRadius: '50%', flexShrink: 0, padding: 0, background: 'transparent', cursor: 'pointer',
        border: `${Q(4)}px solid ${ink === key ? 'var(--wt-text)' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: Q(60), height: Q(60), borderRadius: '50%', display: 'block', background: pageInkColor(surface, key),
          // A dark first pen (paper, the whiteboard) would vanish on the charcoal sheet without an edge.
          boxShadow: `0 0 0 ${Q(2)}px color-mix(in srgb, var(--wt-text) 22%, transparent)`,
        }}
      />
    </SheetButton>
  ));
  const pens = ([0, 1] as const).map((size) => (
    <SheetButton
      key={size}
      data-testid={`note-draw-pen-${size}`}
      aria-label={t(size === 0 ? 'notes.draw.thin' : 'notes.draw.thick')}
      aria-pressed={pen === size}
      onPress={() => setPen(size)}
      style={{
        width: Q(84), height: Q(84), borderRadius: Q(22), flexShrink: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center',
        background: pen === size ? 'color-mix(in srgb, var(--wt-accent) 22%, var(--wt-bg))' : 'var(--wt-bg)',
        border: `${Q(2)}px solid ${pen === size ? 'var(--wt-accent)' : 'var(--wt-border)'}`,
      }}
    >
      <span aria-hidden="true" style={{ width: Q(size === 0 ? 14 : 36), height: Q(size === 0 ? 14 : 36), borderRadius: '50%', background: 'var(--wt-text)', display: 'block' }} />
    </SheetButton>
  ));
  const undoButton = (
    <SheetButton data-testid="note-draw-undo" disabled={!canUndo} onPress={undo} style={pill(Q, { off: !canUndo })}>
      <Undo2 size={Q(30)} strokeWidth={2.4} aria-hidden="true" />
      {t('notes.draw.undo')}
    </SheetButton>
  );
  const startOverButton = (
    <SheetButton data-testid="note-draw-start-over" disabled={!has} onPress={startOver} style={pill(Q, { off: !has })}>
      <Trash2 size={Q(28)} strokeWidth={2.2} aria-hidden="true" />
      {t('notes.draw.startOver')}
    </SheetButton>
  );
  const nextButton = (
    <SheetButton data-testid="note-draw-next" disabled={!has} onPress={() => { setProblem(null); setStep('who'); }} style={pill(Q, { filled: true, off: !has, tall: true })}>
      {t('notes.draw.next')}
      <ArrowRight size={Q(32)} strokeWidth={2.6} aria-hidden="true" />
    </SheetButton>
  );
  // Side by side on a portrait wall, one over the other beside a landscape page: each keeps its full height either way.
  const askButton: CSSProperties = landscape ? { width: '100%' } : { flex: 1 };
  const ask = (
    <div
      role="alertdialog"
      aria-label={t('notes.draw.askTitle')}
      data-testid="note-draw-ask"
      style={{
        borderRadius: Q(26), padding: `${Q(22)}px ${Q(28)}px`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: Q(18),
        background: 'color-mix(in srgb, #f87171 9%, var(--wt-surface))', border: `${Q(2)}px solid color-mix(in srgb, #f87171 30%, transparent)`,
      }}
    >
      <div style={{ fontSize: Q(34), fontWeight: 700 }}>{t('notes.draw.askTitle')}</div>
      <div style={{ display: 'flex', flexDirection: landscape ? 'column' : 'row', gap: Q(16) }}>
        <SheetButton data-testid="note-draw-keep" onPress={() => setAsking(false)} style={{ ...pill(Q, { filled: true }), ...askButton }}>
          {t('notes.draw.askKeep')}
        </SheetButton>
        <SheetButton
          data-testid="note-draw-throw"
          onPress={() => onClose(null)}
          style={{ ...pill(Q), ...askButton, background: 'transparent', color: '#f87171', borderColor: 'color-mix(in srgb, #f87171 45%, transparent)' }}
        >
          <Trash2 size={Q(28)} strokeWidth={2.2} aria-hidden="true" />
          {t('notes.draw.askThrow')}
        </SheetButton>
      </div>
    </div>
  );

  let body: ReactNode;
  if (step === 'draw' && landscape) {
    body = (
      <>
        {heading(t('notes.defaultTitle'), t('notes.draw.title'))}
        <div style={{ display: 'flex', gap: Q(36), marginTop: Q(22), flex: 1, minHeight: 0 }}>
          {page}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {asking ? <div style={{ marginTop: 'auto' }}>{ask}</div> : (
              <>
                <div style={label(Q)}>{t('notes.draw.color')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${Q(84)}px)`, gap: `${Q(14)}px ${Q(34)}px`, marginTop: Q(12) }}>{dots}</div>
                <div style={{ ...label(Q), marginTop: Q(30) }}>{t('notes.draw.pen')}</div>
                <div style={{ display: 'flex', gap: Q(18), marginTop: Q(12) }}>{pens}</div>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: Q(14) }}>
                  {undoButton}
                  {startOverButton}
                  <div style={{ height: Q(12) }} />
                  {nextButton}
                </div>
              </>
            )}
          </div>
        </div>
      </>
    );
  } else if (step === 'draw') {
    body = (
      <>
        {heading(t('notes.defaultTitle'), t('notes.draw.title'))}
        <div style={{ marginTop: Q(26) }}>{page}</div>
        {asking ? <div style={{ marginTop: Q(24), height: Q(208), display: 'grid' }}>{ask}</div> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: Q(18), marginTop: Q(24), height: Q(92) }}>
              {dots}
              <span aria-hidden="true" style={{ width: Q(2), height: Q(56), background: 'var(--wt-border)', margin: `0 ${Q(10)}px` }} />
              {pens}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: Q(16), marginTop: Q(20), height: Q(96) }}>
              {undoButton}
              {startOverButton}
              <div style={{ flex: 1 }} />
              {nextButton}
            </div>
          </>
        )}
      </>
    );
  } else {
    // The face over the name, so the name has the tile's whole width: "Nobody" and a long name both fit.
    const faceSize = Q(56);
    const name: CSSProperties = { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    const tile = (on: boolean): CSSProperties => ({
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: Q(8), height: Q(124), padding: `0 ${Q(12)}px`,
      borderRadius: Q(24), minWidth: 0, font: 'inherit', fontSize: Q(27), fontWeight: 600, color: 'var(--wt-text)', cursor: 'pointer', textAlign: 'center',
      background: on ? 'color-mix(in srgb, var(--wt-accent) 20%, var(--wt-bg))' : 'var(--wt-bg)',
      border: `${Q(2)}px solid ${on ? 'var(--wt-accent)' : 'var(--wt-border)'}`,
    });
    const who = (
      <div
        data-testid="note-draw-faces"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: Q(14), overflowY: 'auto', scrollbarWidth: 'none', minHeight: 0, touchAction: 'pan-y' }}
      >
        {members.map((member) => (
          <SheetButton key={member.id} data-testid="note-draw-face" data-member={member.id} aria-pressed={picked === member.id} onPress={() => setAuthorId(member.id)} style={tile(picked === member.id)}>
            <span
              aria-hidden="true"
              style={{
                width: faceSize, height: faceSize, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: member.color, color: memberInk(member.color), fontSize: Q(26), fontWeight: 800, lineHeight: 1,
              }}
            >
              {memberInitials(member.name)}
            </span>
            <span style={name}>{member.name}</span>
          </SheetButton>
        ))}
        <SheetButton data-testid="note-draw-face" data-member="" aria-pressed={picked === null} onPress={() => setAuthorId(null)} style={tile(picked === null)}>
          <span aria-hidden="true" style={{ width: faceSize, height: faceSize, borderRadius: '50%', flexShrink: 0, border: `${Q(3)}px dashed var(--wt-border)` }} />
          <span style={name}>{t('notes.draw.nobody')}</span>
        </SheetButton>
      </div>
    );
    const lives = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: Q(14) }}>
        {WALL_DRAWING_LIVES.map((value) => (
          <SheetButton
            key={value}
            data-testid={`note-draw-life-${value}`}
            aria-pressed={life === value}
            onPress={() => setLife(value)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: Q(76), padding: `0 ${Q(34)}px`, borderRadius: Q(38),
              font: 'inherit', fontSize: Q(28), fontWeight: 600, cursor: 'pointer',
              background: life === value ? 'var(--wt-accent)' : 'var(--wt-bg)', color: life === value ? 'var(--wt-on-accent)' : 'var(--wt-text)',
              border: `${Q(2)}px solid ${life === value ? 'transparent' : 'var(--wt-border)'}`,
            }}
          >
            {t(`notes.draw.lives.${value}`)}
          </SheetButton>
        ))}
      </div>
    );
    // The line's place is kept whether or not there is anything to say, so
    // a failure never pushes the button out from under a finger.
    const status = (
      <div style={{ minHeight: Q(88), display: 'flex', alignItems: 'center' }}>
        {problem && <div style={{ flex: 1 }}><WallNotice tone="error" P={Q} testId="note-draw-problem">{problem}</WallNotice></div>}
      </div>
    );
    const preview = (
      <div
        style={{
          width: Q(landscape ? 560 : 352), aspectRatio: '4 / 3', flexShrink: 0, borderRadius: Q(22), padding: Q(6), background: look.background, color: look.ink,
          boxShadow: `0 0 0 ${Q(2)}px var(--wt-border)`,
        }}
      >
        <NoteDrawingArt drawing={{ lines }} surface={surface} label={t('notes.drawing')} />
      </div>
    );
    const back = (
      <SheetButton data-testid="note-draw-back" disabled={busy} onPress={() => setStep('draw')} style={pill(Q, { off: busy })}>
        <ArrowLeft size={Q(30)} strokeWidth={2.4} aria-hidden="true" />
        {t('notes.draw.back')}
      </SheetButton>
    );
    const ready = picked !== undefined && !busy;
    const go = (
      <SheetButton data-testid="note-draw-post" disabled={!ready} onPress={() => void post()} style={pill(Q, { filled: true, off: !ready, tall: true })}>
        <Check size={Q(32)} strokeWidth={3} aria-hidden="true" />
        {t(busy ? 'notes.draw.posting' : problem && picked !== undefined ? 'notes.draw.retry' : 'notes.draw.post')}
      </SheetButton>
    );
    body = landscape ? (
      <>
        {heading(t('notes.draw.title'), t('notes.draw.whoTitle'))}
        <div style={{ display: 'flex', gap: Q(40), marginTop: Q(26), flex: 1, minHeight: 0 }}>
          {preview}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...label(Q), marginBottom: Q(14) }}>{t('notes.draw.from')}</div>
            {who}
            <div style={{ ...label(Q), margin: `${Q(26)}px 0 ${Q(14)}px` }}>{t('notes.draw.staysFor')}</div>
            {lives}
          </div>
        </div>
        {status}
        <div style={{ display: 'flex', alignItems: 'center', gap: Q(16) }}>{back}<div style={{ flex: 1 }} />{go}</div>
      </>
    ) : (
      <>
        {heading(t('notes.draw.title'), t('notes.draw.whoTitle'))}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: Q(22) }}>{preview}</div>
        <div style={{ ...label(Q), margin: `${Q(26)}px 0 ${Q(14)}px` }}>{t('notes.draw.from')}</div>
        {who}
        <div style={{ ...label(Q), margin: `${Q(26)}px 0 ${Q(14)}px` }}>{t('notes.draw.staysFor')}</div>
        {lives}
        <div style={{ flex: 1, minHeight: Q(8) }} />
        {status}
        <div style={{ display: 'flex', alignItems: 'center', gap: Q(16), marginTop: Q(8) }}>{back}<div style={{ flex: 1 }} />{go}</div>
      </>
    );
  }

  return (
    <WallOverlay
      label={t('notes.draw.title')}
      testId="note-draw-sheet"
      // Left alone: the card keeps the page for a while, so a child called to dinner does not lose it.
      // A page just started over is kept as it was before: Undo would still have brought it back.
      onClose={() => {
        const stack = clearedRef.current;
        const page = linesRef.current.length > 0 ? linesRef.current : stack.length > 0 ? stack[stack.length - 1] : null;
        onClose(page);
      }}
      autoCloseMs={NOTE_DRAW_IDLE_MS}
      paused={busy}
      closeOnScrim={false}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      <div
        data-step={step}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...wallTypingVars(SHEET_THEME, accent),
          position: 'absolute', left: '50%', width: Q(shape.width), height: Q(shape.height), boxSizing: 'border-box',
          ...(landscape
            ? { top: '50%', transform: 'translate(-50%, -50%)', borderRadius: Q(44), animation: 'wall-card-in 250ms ease-out', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }
            : { bottom: 0, transform: 'translateX(-50%)', borderRadius: `${Q(44)}px ${Q(44)}px 0 0`, animation: 'wall-sheet-in 250ms ease-out', boxShadow: '0 -16px 60px rgba(0,0,0,0.5)' }),
          background: 'var(--wt-surface)', color: 'var(--wt-text)', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'default',
        }}
      >
        {!landscape && <div aria-hidden="true" style={{ width: Q(96), height: Q(10), borderRadius: Q(5), background: 'var(--wt-border)', margin: `${Q(18)}px auto ${Q(10)}px`, flexShrink: 0 }} />}
        <div aria-hidden="true" style={{ height: Q(10), background: 'var(--wt-accent)', flexShrink: 0 }} />
        <fieldset
          disabled={settling}
          style={{ flex: 1, minHeight: 0, minWidth: 0, margin: 0, border: 0, display: 'flex', flexDirection: 'column', padding: `${Q(landscape ? 26 : 30)}px ${Q(44)}px ${Q(landscape ? 34 : 44)}px` }}
        >
          {body}
        </fieldset>
      </div>
    </WallOverlay>
  );
}
