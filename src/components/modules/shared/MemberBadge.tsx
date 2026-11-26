import type { CSSProperties, ReactNode } from 'react';
import { ink } from '@/lib/constants';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import ChoreIcon from '../chore-chart/ChoreIcon';

/** Letters past one shrink a step inside the circle, which keeps its size. */
const LONGER_LETTERS: Record<number, string | undefined> = { 1: undefined, 2: '0.85em' };

export interface MemberBadgeProps {
  /**
   * The person's letters: `memberInitials`, or `getUniqueInitials` over the
   * roster where the badge stands alone with no name beside it.
   */
  initials: string;
  /** The person's colour; none draws the neutral badge (someone who has left the family). */
  color?: string | null;
  /**
   * The letters' size: a length in the surrounding text's ems, or px. The
   * badge's own font, so `size` in ems is a multiple of it.
   */
  fontSize?: number | string;
  /** The circle's diameter: px, or a length in the badge's own ems (see `fontSize`). */
  size?: number | string;
  /** In place of the letters: a person's own icon, a tick. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
  /** The caller's own marks for its tests. */
  [attr: `data-${string}`]: string | undefined;
}

/**
 * A person at a glance: their initials on their colour, in the ink that reads
 * on it (`memberInk`), so amber, mint and pink get dark letters and blue and
 * red get white ones, the same on every card. Sized in ems by default, so it
 * follows the card's type. Event name tags, legends, avatars, to-do and note
 * bubbles and chore columns all draw this instead of their own circle.
 */
export function MemberBadge({
  initials, color, fontSize = '0.8em', size = '1.7em', children, className, style, ...attrs
}: MemberBadgeProps) {
  const shrink = initials.length > 2 ? '0.72em' : LONGER_LETTERS[initials.length];
  return (
    <span
      {...attrs}
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize, fontWeight: 700, lineHeight: 1,
        background: color || ink(0.25),
        color: color ? memberInk(color) : ink(1),
        ...style,
      }}
    >
      {children ?? (shrink ? <span style={{ fontSize: shrink }}>{initials}</span> : initials)}
    </span>
  );
}

/**
 * What goes inside a person's circle where a child picks themselves: their
 * own icon when the family gave them one (a train, a unicorn), else their
 * letters. A child who cannot read finds the picture; the small dots that
 * only say whose chore it is keep to letters. `size` is the icon's px.
 */
export function MemberGlyph({ member, size }: { member: { name: string; color: string; emoji?: string }; size: number }) {
  const initials = memberInitials(member.name);
  return member.emoji
    ? <ChoreIcon value={member.emoji} size={size} color={memberInk(member.color)} bare fallback={initials} />
    : <>{initials}</>;
}
