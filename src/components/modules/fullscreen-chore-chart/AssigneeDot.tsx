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
  /**
   * Name printed under the dot, when the row is tall enough to hold one.
   * A parent glancing from the kitchen reads "Marshall", not a colour.
   */
  label?: string;
  labelSize?: number;
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
  label,
  labelSize = 0,
  allowTouch,
  onToggle,
}: AssigneeDotProps) {
  const iconSz = dotSize * 0.55;
  const t = useTranslate('modules');

  const dot = (
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

  if (!label || labelSize <= 0) return dot;
  return (
    <div
      data-testid="fcc-dot-labelled"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: labelSize * 0.15, width: dotSlotWidth(dotSize, labelSize), flexShrink: 0 }}
    >
      {dot}
      <span
        style={{
          fontSize: labelSize,
          lineHeight: 1,
          fontWeight: 600,
          color: isCompleted ? 'var(--fcc-text)' : 'var(--fcc-text-2)',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Width of one labelled dot column: room for an eight-letter name under the dot. */
export function dotSlotWidth(dotSize: number, labelSize: number): number {
  return Math.max(dotSize * 1.6, labelSize * 4.6);
}
