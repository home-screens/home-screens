'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FamilyMember } from '@/types/family';
import type { ChoreWriteOutcome } from '@/lib/chore-client';
import { useTranslate } from '@/i18n';
import { DIVIDER } from '@/lib/constants';

/** How long "that didn't save" stays up. A passing message, like the overspent notice. */
export const CHORE_WRITE_ALERT_MS = 5000;

/** `bonus` marks a bonus chore the hub refused, which names who has it. */
export interface ChoreWriteAlert {
  text: string;
  bonus: boolean;
}

/**
 * What a chart says when a tick, a grab or an undo did not go through. Both
 * charts use it: the screen has already put the tick back, and without words a
 * kid walks away believing it counted.
 *
 * Only a bonus refusal gets bonus words ("Esme got it first"); anything else
 * (a regular chore, a hub out of reach) is a plain "didn't save". The chart
 * cannot tell who tapped, so it names who has the chore.
 */
export function useChoreWriteAlert(members: readonly FamilyMember[]) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const [alert, setAlert] = useState<ChoreWriteAlert | null>(null);
  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => setAlert(null), CHORE_WRITE_ALERT_MS);
    return () => clearTimeout(id);
  }, [alert]);

  /** Says so for a write that failed; one that went through clears an earlier "didn't save". */
  const report = useCallback((outcome: ChoreWriteOutcome) => {
    if (outcome.ok) {
      setAlert(null);
      return;
    }
    if (!outcome.refusal) {
      setAlert({ text: tCore('refusals.saveFailed'), bonus: false });
      return;
    }
    const name = members.find((m) => m.id === outcome.memberId)?.name;
    const text = outcome.refusal === 'grabbed' && name ? t('chore-chart.bonus.refused.grabbed', { name })
      : outcome.refusal === 'taken' && name ? t('chore-chart.bonus.refused.taken', { name })
      : t('chore-chart.bonus.refused.other');
    setAlert({ text, bonus: true });
  }, [members, t, tCore]);

  return { alert, report };
}

/**
 * The card's own place for it: in the flow at the foot of the box, where the
 * overspent notice sits, because text laid over a translucent card would be
 * read through its rows.
 */
export function ChoreWriteNotice({ alert, accentColor }: { alert: ChoreWriteAlert; accentColor: string }) {
  return (
    <div
      role="alert"
      data-testid="chore-write-alert"
      style={{
        marginTop: '0.4em',
        paddingTop: '0.4em',
        borderTop: `1px solid ${DIVIDER.visible}`,
        fontSize: '0.85em',
        lineHeight: 1.3,
        fontWeight: 600,
        color: accentColor,
      }}
    >
      {alert.bonus ? '✋ ' : ''}{alert.text}
    </div>
  );
}
