'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { FamilyMember } from '@/types/family';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { memberInitials } from '@/lib/family-avatar';

type FaceMember = Pick<FamilyMember, 'name' | 'emoji'>;

/**
 * A person's own icon, or their initials when they have none (or it is one of
 * the family's icons that has since been removed). `color` is left out where
 * the face takes the ink of what it sits in.
 */
export function MemberFace({ member, size, initialsSize, color }: { member: FaceMember; size: number; initialsSize: number; color?: string }) {
  const initials = <span style={{ fontSize: initialsSize, fontWeight: 600, color }}>{memberInitials(member.name)}</span>;
  return member.emoji ? <ChoreIcon value={member.emoji} size={size} color={color} fallback={initials} /> : initials;
}

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
      {members.map((member) => {
        const isActive = member.id === selectedId;
        const ink = isActive ? member.color : 'var(--hs-text-muted)';
        return (
          <button
            key={member.id}
            className={`press-scale ${pillClassName}`.trim()}
            onClick={() => onSelect(member.id)}
            aria-label={ariaLabel?.(member)}
            aria-pressed={isActive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              // A fixed height: anything drawn after the name (the tick for
              // a finished day) is taller than the name, and grew the chip,
              // moving the whole list under a finger.
              height: 44,
              maxWidth: '100%',
              borderRadius: 999,
              border: `2px solid ${isActive ? member.color : 'transparent'}`,
              background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
              color: ink,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ flexShrink: 0, display: 'inline-flex' }}>
              <MemberFace member={member} size={18} initialsSize={16} color={ink} />
            </span>
            {/* A very long name gets an ellipsis instead of pushing every
                other member off the screen. */}
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
            {trailing?.(member)}
          </button>
        );
      })}
    </div>
  );
}
