'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { FamilyMember } from '@/types/family';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { memberInitials } from '@/lib/family-avatar';

type FaceMember = Pick<FamilyMember, 'name' | 'emoji'>;
type ChipPerson = Pick<FamilyMember, 'name' | 'color' | 'emoji'>;

/**
 * A person's own icon, or their initials when they have none (or it is one of
 * the family's icons that has since been removed). `color` is left out where
 * the face takes the ink of what it sits in.
 */
export function MemberFace({ member, size, initialsSize, color }: { member: FaceMember; size: number; initialsSize: number; color?: string }) {
  const initials = <span style={{ fontSize: initialsSize, fontWeight: 600, color }}>{memberInitials(member.name)}</span>;
  return member.emoji ? <ChoreIcon value={member.emoji} size={size} color={color} fallback={initials} /> : initials;
}

interface PersonChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  member: ChipPerson;
  selected: boolean;
  /** Drawn in place of the person's own icon or initials (the dashed ring of "Nobody"). */
  face?: ReactNode;
  /** After the name: a ticket balance, the tick for a finished day. */
  trailing?: ReactNode;
}

/**
 * One person to pick, the way every "who" chooser on the phone draws them:
 * their own icon, else their initials, then their name, and a border and wash
 * in their own colour once chosen. The words stay in the page's text colour,
 * since a person's colour is often too light to read on the light theme. A fixed 44 px tall, so a finger finds it
 * and anything drawn after the name never grows the row under it.
 *
 * Pass `aria-pressed` for a pick-several row; the chip itself only draws.
 * The compact assignee dots on list rows stay initials only.
 */
export default function PersonChip({ member, selected, face, trailing, className, style, type = 'button', ...rest }: PersonChipProps) {
  const ink = selected ? 'var(--hs-text-primary)' : 'var(--hs-text-secondary)';
  return (
    <button
      {...rest}
      type={type}
      className={`press-scale ${className ?? ''}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        height: 44,
        maxWidth: '100%',
        borderRadius: 999,
        border: `2px solid ${selected ? member.color : 'transparent'}`,
        background: selected ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
        color: ink,
        fontSize: 13,
        fontWeight: selected ? 600 : 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.15s',
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex' }}>
        {face ?? <MemberFace member={member} size={18} initialsSize={16} color={ink} />}
      </span>
      {/* A very long name gets an ellipsis instead of pushing everyone else off the screen. */}
      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
      {trailing}
    </button>
  );
}
