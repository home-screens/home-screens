'use client';

/**
 * One person's avatar, the way the rest of the editor draws it: their colour
 * behind their picture, or the first letter of their name when they have none.
 *
 * Names, colours and pictures all come from the family roster, so nothing here
 * takes a copy of them.
 *
 * Hovering a dot says whose it is. A colour and a first letter cannot tell two
 * children apart when both names start with the same letter, and a picture on
 * its own says even less. The dot stays out of the reading order, so every
 * place that draws one either shows the name beside it or names the whole row
 * of dots at once.
 */

import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import type { FamilyMember } from '@/types/family';

export default function MemberDot({ member, size = 22 }: { member: FamilyMember; size?: number }) {
  return (
    <span
      title={member.name}
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.45)),
        backgroundColor: `${member.color}25`,
        color: member.color,
      }}
    >
      {member.emoji ? (
        <ChoreIcon value={member.emoji} color={member.color} size={Math.round(size * 0.6)} bare fallback={member.name.slice(0, 1)} />
      ) : (
        member.name.slice(0, 1)
      )}
    </span>
  );
}
