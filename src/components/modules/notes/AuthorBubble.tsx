import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';
import { initialOf } from '@/lib/notes-rules';
import type { NoteAuthor } from './shared';

/** The letter's size as a share of the bubble, the chore chart's proportion. */
const LETTER = 0.64;

const BUBBLE_CLASS = 'inline-flex items-center justify-center rounded-full shrink-0 font-extrabold';

function bubbleBox(em: number): CSSProperties {
  // The span's own font is the letter's size, so the box is drawn in its
  // ems: `em` base ems across, whatever type it sits in.
  return { fontSize: `${em * LETTER}em`, width: `${1 / LETTER}em`, height: `${1 / LETTER}em`, lineHeight: 1 };
}

/**
 * The author's initial in their colour with dark ink, sized in ems so it
 * follows the fitted type. A note with no author, or one whose author has
 * left the family, gets the neutral bubble with a question mark.
 */
export function AuthorBubble({ author, em = 0.93, style }: {
  author: NoteAuthor;
  /** Diameter in ems of the surrounding type. */
  em?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      data-testid="notes-author"
      data-author={author.id ?? 'someone'}
      className={BUBBLE_CLASS}
      title={author.name}
      style={{
        ...bubbleBox(em),
        backgroundColor: author.color ?? ink(0.25),
        // Dark on the member's colour: chip ink, not card ink. The neutral
        // bubble is a faint fill of the card's ink, so its mark is card ink.
        color: author.color ? '#111' : ink(1),
        ...style,
      }}
    >
      {author.color ? initialOf(author.name) : '?'}
    </span>
  );
}

/** The "+N" bubble after the first few authors (the five-plus-members rule). */
export function MoreBubble({ n, em = 0.93, style }: { n: number; em?: number; style?: CSSProperties }) {
  return (
    <span
      data-testid="notes-author-more"
      className={BUBBLE_CLASS}
      style={{ ...bubbleBox(em), backgroundColor: ink(0.2), color: ink(1), ...style }}
    >
      +{n}
    </span>
  );
}
