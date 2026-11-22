'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Check, Info, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { getThemeTokens, type FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { refusalSentence } from '@/lib/hub-request';
import { RefusalError } from '@/lib/refusal';
import { WALL_ITEM_MAX_LENGTH } from '@/lib/todo-wall';
import { useWallOverlayScale } from './useWallOverlayScale';
import { useWallTyping } from './useWallTyping';
import { WallNotice } from './WallNotice';
import { WallTypingSheet } from './WallTypingSheet';
import { wallPressProps } from './wallPress';

/** What one Add did, for its chip. */
export interface WallAddResult {
  /**
   * `added` new; `already` on the list and still to do (nothing changed);
   * `putBack` was ticked off and is back on the list; `merged` folded into a
   * line already there (Mealie does that), so nothing new to take off.
   */
  outcome: 'added' | 'already' | 'putBack' | 'merged';
  /** The item as the list now says it. */
  text: string;
  /** Takes the add back (off the list again, or ticked again); absent when there is nothing to undo. */
  undo?: () => Promise<void>;
}

interface Chip extends WallAddResult {
  key: number;
}

/** The sheet's own colours: the charcoal every card's sheet on the wall uses. */
const SHEET_THEME = getThemeTokens('charcoal');

export interface WallAddSheetProps {
  /** The list's name, for the heading. */
  listName: string;
  /** Small words after the heading ("5 left"). */
  aside?: string;
  /** Where the list lives when it isn't Home Screens ("Mealie"), as a small tag by the name. */
  source?: string;
  /** The card's accent: the stripe, the field, the action key. */
  accent: string;
  theme?: FullscreenThemeTokens;
  /** Put the words on the list. Rejects with what went wrong. */
  onAdd: (text: string) => Promise<WallAddResult>;
  /** The line for a refusal that has no sentence of its own ("Mealie isn't answering"). */
  failedText?: string;
  onClose: () => void;
}

/**
 * The add sheet a list card opens on a touch wall: type one thing, tap Add,
 * and the box empties for the next one. Each thing added shows as a chip,
 * newest first on one line, with Undo until the sheet closes. Something
 * already on the list adds nothing and says so; something ticked off is put
 * back rather than added twice (the hub decides, `addItemIfNew`). A failed
 * add keeps the words and says what happened.
 */
export function WallAddSheet({ listName, aside, source, accent, theme = SHEET_THEME, onAdd, failedText, onClose }: WallAddSheetProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const { P } = useWallOverlayScale();
  const typing = useWallTyping({ maxLength: WALL_ITEM_MAX_LENGTH, capitalize: true });
  const [chips, setChips] = useState<Chip[]>([]);
  // What went wrong, and the words it went wrong with: the line goes as soon
  // as the words change, and the chips (with their Undo) come back.
  const [problem, setProblem] = useState<{ message: string; words: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);
  // A second tap on Add while the first is on its way would send the words twice.
  const busyRef = useRef(false);

  const explain = useCallback((err: unknown) => {
    if (err instanceof RefusalError) return refusalSentence(err, tCore) ?? failedText ?? t('wallAdd.failed');
    // No answer at all (the request failed or ran out of time): the hub is out of reach.
    if (err instanceof TypeError || (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError'))) {
      return t('wallAdd.unreachable');
    }
    return failedText ?? t('wallAdd.failed');
  }, [t, tCore, failedText]);

  const add = useCallback(async () => {
    const words = typing.text.trim();
    if (!words || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await onAdd(words);
      typing.clear();
      setProblem(null);
      setChips((current) => [{ ...result, key: nextKey.current++ }, ...current]);
    } catch (err) {
      setProblem({ message: explain(err), words: typing.text });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [typing, onAdd, explain]);

  const undo = useCallback(async (chip: Chip) => {
    if (!chip.undo) return;
    try {
      await chip.undo();
      setProblem(null);
      setChips((current) => current.filter((c) => c.key !== chip.key));
    } catch {
      setProblem({ message: t('wallAdd.undoFailed'), words: typing.text });
    }
  }, [t, typing.text]);

  let status: ReactNode;
  if (problem && problem.words === typing.text) {
    status = <WallNotice tone="error" P={P} testId="wall-add-problem">{problem.message}</WallNotice>;
  } else if (chips.length > 0) {
    status = (
      <div>
        <div style={{ fontSize: P(20), letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wt-text-3)', fontWeight: 600, marginBottom: P(12) }}>
          {t('wallAdd.justAdded')}
        </div>
        <div
          data-testid="wall-add-chips"
          style={{
            display: 'flex', gap: P(14), overflow: 'hidden',
            // Older ones slide off the end rather than wrap, so the sheet never grows.
            WebkitMaskImage: 'linear-gradient(90deg, #000 88%, transparent)', maskImage: 'linear-gradient(90deg, #000 88%, transparent)',
          }}
        >
          {chips.map((chip) => <AddChip key={chip.key} chip={chip} P={P} onUndo={() => void undo(chip)} />)}
        </div>
      </div>
    );
  } else {
    status = <div style={{ fontSize: P(26), color: 'var(--wt-text-2)', lineHeight: 1.4, paddingTop: P(6) }}>{t('wallAdd.hint')}</div>;
  }

  return (
    <WallTypingSheet
      label={t('wallAdd.rowLabel', { list: listName })}
      testId="wall-add-sheet"
      kicker={t('wallAdd.kicker')}
      title={(
        <>
          {listName}
          {source && (
            <span style={{
              fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', fontSize: P(22), fontWeight: 650, color: 'var(--wt-text-2)',
              border: `${P(2)}px solid var(--wt-border)`, borderRadius: 999, padding: `${P(2)}px ${P(14)}px`, marginLeft: P(16), verticalAlign: 'middle',
            }}>
              {source}
            </span>
          )}
        </>
      )}
      aside={aside}
      theme={theme}
      accent={accent}
      typing={typing}
      placeholder={t('wallAdd.placeholder')}
      actionLabel={t('wallAdd.action')}
      actionIcon={<Plus size={P(30)} strokeWidth={3} aria-hidden="true" />}
      actionDisabled={busy || typing.text.trim() === ''}
      onAction={() => void add()}
      onClose={onClose}
    >
      {status}
    </WallTypingSheet>
  );
}

function AddChip({ chip, P, onUndo }: { chip: Chip; P: (n: number) => number; onUndo: () => void }) {
  const t = useTranslate('modules');
  const note = chip.outcome === 'already' ? t('wallAdd.already') : chip.outcome === 'putBack' ? t('wallAdd.putBack') : chip.outcome === 'merged' ? t('wallAdd.merged') : null;
  const icon = chip.outcome === 'already'
    ? <Info size={P(30)} strokeWidth={2.4} style={{ color: '#fcd34d' }} aria-hidden="true" />
    : chip.outcome === 'putBack'
      ? <RotateCcw size={P(28)} strokeWidth={2.4} style={{ color: '#93c5fd' }} aria-hidden="true" />
      : <Check size={P(30)} strokeWidth={3} style={{ color: '#4ade80' }} aria-hidden="true" />;
  return (
    <span
      data-testid="wall-add-chip"
      data-outcome={chip.outcome}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: P(10), flexShrink: 0, height: P(72), whiteSpace: 'nowrap',
        padding: chip.undo ? `0 ${P(9)}px 0 ${P(20)}px` : `0 ${P(26)}px 0 ${P(20)}px`, borderRadius: P(36),
        background: 'color-mix(in srgb, var(--wt-text) 6%, var(--wt-surface))', border: '1px solid color-mix(in srgb, var(--wt-text) 12%, var(--wt-surface))',
        fontSize: P(27), fontWeight: 600, color: 'var(--wt-text)',
      }}
    >
      {icon}
      {chip.text}
      {note && <span style={{ fontSize: P(24), fontWeight: 500, color: 'var(--wt-text-2)' }}>{note}</span>}
      {chip.undo && (
        <button
          type="button"
          {...wallPressProps}
          data-testid="wall-add-undo"
          onClick={onUndo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: P(8), height: P(54), padding: `0 ${P(18)}px`, borderRadius: P(27),
            background: 'var(--wt-surface)', border: `${P(2)}px solid var(--wt-border)`, color: 'var(--wt-text)',
            font: 'inherit', fontSize: P(24), fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Undo2 size={P(24)} strokeWidth={2.6} aria-hidden="true" />
          {t('wallAdd.undo')}
        </button>
      )}
    </span>
  );
}
