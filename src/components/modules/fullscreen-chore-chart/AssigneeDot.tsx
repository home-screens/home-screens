'use client';

import { Check } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { ToggleParams } from './helpers';

interface AssigneeDotProps {
  memberId: string;
  isCompleted: boolean;
  dotSize: number;
  choreId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  initial: string;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

/**
 * One member's mark on a chore row. Done is a solid disc with a check;
 * still-to-do is a ring in the member's full colour over a light tint of it,
 * with the initial inside. Both read from across a room: the to-do state is
 * what a parent scans for, so it is never dimmed.
 */
export default function AssigneeDot({
  memberId,
  isCompleted,
  dotSize,
  choreId,
  choreName,
  memberName,
  memberColor,
  initial,
  allowTouch,
  onToggle,
}: AssigneeDotProps) {
  const iconSz = dotSize * 0.55;
  const t = useTranslate('modules');

  return (
    <div
      data-testid="fcc-dot"
      className={allowTouch ? 'press-dot' : undefined}
      role={allowTouch ? 'button' : undefined}
      tabIndex={allowTouch ? 0 : undefined}
      onClick={
        allowTouch
          ? () => onToggle({ choreId, memberId, choreName, memberName, memberColor, wasCompleted: isCompleted })
          : undefined
      }
      aria-label={
        allowTouch
          ? t(
              isCompleted
                ? 'fullscreen-chore-chart.ariaLabels.undoChore'
                : 'fullscreen-chore-chart.ariaLabels.completeChore',
              { chore: choreName, member: memberName },
            )
          : undefined
      }
      style={{
        width: dotSize,
        height: dotSize,
        // A dot is a circle whatever the row does: never shrunk by a crowded
        // line, and its ring is drawn inside the size, not added to it.
        flexShrink: 0,
        boxSizing: 'border-box',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: allowTouch ? 'pointer' : 'default',
        ...(isCompleted
          ? { background: memberColor }
          : {
              border: `${Math.max(3, Math.round(dotSize * 0.06))}px solid ${memberColor}`,
              background: `color-mix(in srgb, ${memberColor} 16%, transparent)`,
              color: memberColor,
              fontSize: dotSize * (initial.length > 1 ? 0.34 : 0.42),
              fontWeight: 700,
              lineHeight: 1,
            }),
      }}
    >
      {isCompleted ? <Check size={iconSz} color="white" strokeWidth={3} /> : initial}
    </div>
  );
}
