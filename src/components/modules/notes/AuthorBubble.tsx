import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';
import type { NoteAuthor } from './shared';
import { MemberBadge } from '../shared/MemberBadge';

/** The letter's size as a share of the bubble, the chore chart's proportion. */
const LETTER = 0.64;

const BUBBLE_CLASS = 'inline-flex items-center justify-center rounded-full shrink-0 font-extrabold';

// The bubble's own font is the letter's size, so the box is drawn in its
// ems: `em` base ems across, whatever type it sits in.
const letterSize = (em: number) => `${em * LETTER}em`;
const BUBBLE_SIZE = `${1 / LETTER}em`;

function bubbleBox(em: number): CSSProperties {
  return { fontSize: letterSize(em), width: BUBBLE_SIZE, height: BUBBLE_SIZE, lineHeight: 1 };
}

/**
 * The author's initials on their colour, in the ink that reads on it, sized
 * in ems so it follows the fitted type. A note with no author, or one whose
 * author has left the family, gets the neutral bubble with a question mark.
 */
export function AuthorBubble({ author, em = 0.93, style }: {
  author: NoteAuthor;
  /** Diameter in ems of the surrounding type. */
  em?: number;
  style?: CSSProperties;
}) {
  return (
    <MemberBadge
      data-testid="notes-author"
      data-author={author.id ?? 'someone'}
      title={author.name}
      initials={author.initials}
      color={author.color}
      fontSize={letterSize(em)}
      size={BUBBLE_SIZE}
      style={{ fontWeight: 800, ...style }}
    />
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
