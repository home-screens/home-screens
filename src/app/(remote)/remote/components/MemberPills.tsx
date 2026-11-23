'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { FamilyMember } from '@/types/family';
import PersonChip from './PersonChip';

/**
 * The row of people a page is about: Chores Today, the Rewards pages, the
 * ticket history. The chosen one takes their own colour. `trailing` draws
 * after the name (the tick for a finished day).
 */
export default function MemberPills({
  members,
  selectedId,
  onSelect,
  trailing,
  ariaLabel,
  className,
  pillClassName = '',
  padding = '12px 0',
}: {
  members: readonly FamilyMember[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  trailing?: (member: FamilyMember) => ReactNode;
  ariaLabel?: (member: FamilyMember) => string;
  className?: string;
  pillClassName?: string;
  padding?: CSSProperties['padding'];
}) {
  return (
    <div className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding }}>
      {members.map((member) => (
        <PersonChip
          key={member.id}
          member={member}
          selected={member.id === selectedId}
          className={pillClassName}
          onClick={() => onSelect(member.id)}
          aria-label={ariaLabel?.(member)}
          aria-pressed={member.id === selectedId}
          trailing={trailing?.(member)}
        />
      ))}
    </div>
  );
}
