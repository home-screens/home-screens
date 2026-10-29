'use client';

import { useEffect } from 'react';
import type { FamilyMember } from '@/types/family';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useTranslate } from '@/i18n';

/** How long the phone's celebration stays before it goes by itself. */
export const DAY_COMPLETE_SHEET_MS = 5000;

const CONFETTI = [
  [18, 8, 10, 18, '#f472b6', 24], [34, 88, 9, 16, '#fbbf24', -32],
  [70, 16, 8, 14, '#60a5fa', 58], [80, 78, 10, 17, '#34d399', -14],
  [140, 5, 8, 14, '#a78bfa', 40], [150, 92, 9, 15, '#e8503a', -52],
] as const;

/**
 * The phone's "all done" moment: a sheet that rises from the bottom with
 * confetti over it. Closes on Nice!, on a tap outside, or by itself. An
 * event, not rotating content: mounted when the last chore is ticked and
 * unmounted on its timer, with CSS keyframes only.
 */
export default function DayCompleteSheet({
  member,
  done,
  total,
  tickets,
  onClose,
  modal = true,
}: {
  member: FamilyMember;
  done: number;
  total: number;
  tickets: number;
  onClose: () => void;
  /**
   * The kid page takes the screen: a tap anywhere closes it. On the grown-up's
   * phone the page stays live underneath, so ticking the next kid's chores is
   * not spent on closing a card.
   */
  modal?: boolean;
}) {
  const t = useTranslate('remote');
  const dialogRef = useFocusTrap<HTMLDivElement>({ focus: 'container' });

  useEffect(() => {
    const id = setTimeout(onClose, DAY_COMPLETE_SHEET_MS);
    return () => clearTimeout(id);
  }, [onClose]);

  const summary = `${t('choresTab.dayComplete.summaryChores', { done, count: total })} · ${t('choresTab.dayComplete.summaryTickets', { count: tickets })}`;

  return (
    <div
      data-testid="day-complete-sheet"
      data-member={member.id}
      style={{ position: 'fixed', inset: 0, zIndex: 220, background: modal ? 'rgba(0,0,0,0.55)' : 'transparent', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: modal ? 'auto' : 'none' }}
      onClick={modal ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('choresTab.dayComplete.title', { name: member.name })}
        tabIndex={-1}
        className="hs-pop-in"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', overflow: 'hidden', outline: 'none', pointerEvents: 'auto',
          width: '100%', maxWidth: 640,
          background: 'var(--hs-bg-panel)', borderRadius: '26px 26px 0 0',
          borderTop: '1px solid var(--hs-border)',
          padding: '28px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
          textAlign: 'center', boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {CONFETTI.map(([top, leftPct, w, h, color, rotate], i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute', top, left: `${leftPct}%`, width: w, height: h, backgroundColor: color, borderRadius: 3,
              ['--hs-confetti-rotate' as string]: `${rotate}deg`,
              animation: `hs-timer-confetti 2.6s ease-in-out ${i * 0.2}s infinite alternate`,
            }}
          />
        ))}
        <div
          style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px', background: member.color, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800,
            boxShadow: `0 0 0 8px color-mix(in srgb, ${member.color} 20%, transparent)`,
          }}
        >
          <ChoreIcon value={member.emoji ?? ''} size={36} color="white" bare fallback={null} />
          {!member.emoji && member.name[0]}
        </div>
        <h3 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--hs-text-primary)' }}>
          {t('choresTab.dayComplete.title', { name: member.name })}
        </h3>
        <p style={{ margin: '6px 0 18px', fontSize: 14, color: 'var(--hs-text-muted)' }}>{summary}</p>
        <button
          type="button"
          data-testid="day-complete-close"
          className="press-scale"
          onClick={onClose}
          style={{ width: '100%', minHeight: 50, borderRadius: 14, border: 'none', background: member.color, color: '#111', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('choresTab.dayComplete.close')}
        </button>
      </div>
    </div>
  );
}
