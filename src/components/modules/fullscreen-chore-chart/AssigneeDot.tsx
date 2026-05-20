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
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: allowTouch ? 'pointer' : 'default',
        ...(isCompleted
          ? { background: memberColor }
          : {
              border: `2px solid ${memberColor}`,
              opacity: 0.4,
              color: memberColor,
              fontSize: dotSize * (initial.length > 1 ? 0.32 : 0.4),
              fontWeight: 700,
            }),
      }}
    >
      {isCompleted ? <Check size={iconSz} color="white" strokeWidth={3} /> : initial}
    </div>
  );
}
