'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { deleteKey, startsSentence, typeKey, WALL_SEARCH_MAX_LENGTH } from '@/lib/wall-keyboard';
import { textLength } from '@/lib/text-length';

/** "N left" shows once this many characters or fewer are left, so the count never nags. */
const SHOW_LEFT_AT = 10;

export interface WallTyping {
  /** The words so far, as typed (trim them before saving). */
  text: string;
  /** Shift is lit: the next letter is a capital. Hand it to `WallKeyboard`. */
  shift: boolean;
  /** Characters left before the cap, once there are ten or fewer; null before that. */
  left: number | null;
  /** How many times the words were cleared: a new line, for `WallKeyboard`'s `round`. */
  round: number;
  onKey: (key: string) => void;
  onDelete: () => void;
  onShift: () => void;
  /** Empty the words (after Add) and let Shift follow the words again. */
  clear: () => void;
  setText: (text: string) => void;
}

export interface WallTypingOptions {
  /** The cap, in characters as people count them (`textLength`). The recipe search's 60 when not given. */
  maxLength?: number;
  /** Light Shift by itself at the start and after the end of a sentence (`startsSentence`). */
  capitalize?: boolean;
  initial?: string;
}

/**
 * The words being typed on the wall's keyboard, and its Shift. Each key
 * builds on the last one typed, not the last render, so two quick taps never
 * lose a letter. Shift follows the words (`capitalize`) until someone taps it,
 * which turns it the other way for one key; any key then hands it back to the
 * words. No caps lock.
 */
export function useWallTyping({ maxLength = WALL_SEARCH_MAX_LENGTH, capitalize = false, initial = '' }: WallTypingOptions = {}): WallTyping {
  const [text, setTextState] = useState(initial);
  // Shift as someone set it for the next key, or null to follow the words.
  const [forced, setForced] = useState<boolean | null>(null);
  const [round, setRound] = useState(0);
  const textRef = useRef(initial);

  const setText = useCallback((next: string) => {
    textRef.current = next;
    setTextState(next);
  }, []);
  const onKey = useCallback((key: string) => {
    setText(typeKey(textRef.current, key, maxLength));
    setForced(null);
  }, [maxLength, setText]);
  const onDelete = useCallback(() => {
    setText(deleteKey(textRef.current));
    setForced(null);
  }, [setText]);
  const clear = useCallback(() => {
    setText('');
    setForced(null);
    setRound((n) => n + 1);
  }, [setText]);

  const shift = forced ?? (capitalize && startsSentence(text));
  const onShift = useCallback(() => setForced(!shift), [shift]);

  const remaining = maxLength - textLength(text);
  const left = remaining <= SHOW_LEFT_AT ? remaining : null;

  return useMemo(
    () => ({ text, shift, left, round, onKey, onDelete, onShift, clear, setText }),
    [text, shift, left, round, onKey, onDelete, onShift, clear, setText],
  );
}
