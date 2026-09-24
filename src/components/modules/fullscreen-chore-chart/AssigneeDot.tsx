'use client';

import { useTranslate } from '@/i18n';
import MemberDot from '../shared/MemberDot';
import type { ToggleParams } from './helpers';

interface AssigneeDotProps {
  memberId: string;
  isCompleted: boolean;
  /** Marked "not today": drawn dashed, and nothing to tap. */
  isSkipped?: boolean;
  dotSize: number;
  choreId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  initial: string;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
  /**
   * Done on another day this week, so not undone from here: drawn fainter,
   * and read out with this ("Esme did it Tuesday").
   */
  doneEarlierLabel?: string;
}

/**
 * One member's mark on a wall-chart chore row. The disc itself is
 * `MemberDot`, shared with the card chore chart; this adds the wall's own
 * interaction, which is a plain tap in both directions.
 */
export default function AssigneeDot({
  memberId,
  isCompleted,
  isSkipped = false,
  dotSize,
  choreId,
  choreName,
  memberName,
  memberColor,
  initial,
  allowTouch,
  onToggle,
  doneEarlierLabel,
}: AssigneeDotProps) {
  const t = useTranslate('modules');
  if (isSkipped) {
    return (
      <MemberDot
        data-testid="fcc-dot-skipped"
        aria-label={t('fullscreen-chore-chart.ariaLabels.notToday', { chore: choreName, member: memberName })}
        size={dotSize}
        color={memberColor}
        initial={initial}
        isCompleted={false}
        isSkipped
      />
    );
  }

  if (doneEarlierLabel) {
    return (
      <MemberDot
        data-testid="fcc-dot-earlier"
        role="img"
        aria-label={doneEarlierLabel}
        title={doneEarlierLabel}
        // Fainter than today's, still read as done on pale light themes.
        style={{ opacity: 0.72 }}
        size={dotSize}
        color={memberColor}
        initial={initial}
        isCompleted
      />
    );
  }

  return (
    <MemberDot
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
      style={{ cursor: allowTouch ? 'pointer' : 'default' }}
      size={dotSize}
      color={memberColor}
      initial={initial}
      isCompleted={isCompleted}
    />
  );
}
