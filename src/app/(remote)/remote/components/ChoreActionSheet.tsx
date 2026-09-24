'use client';

import { useTranslate } from '@/i18n';
import BottomSheet from './BottomSheet';

export interface ChoreAction {
  id: string;
  label: string;
  hint?: string;
  /** A short mark drawn in the square before the label. */
  mark: string;
  onSelect: () => void;
}

/**
 * What a grown-up can do to one chore on the day on screen, opened by holding
 * the chore on the Today tab: tick it for someone, mark it "not today" for one
 * person or everyone, let go of a grab, put a bonus chore back.
 */
export default function ChoreActionSheet({ title, subtitle, actions, onClose }: {
  title: string;
  subtitle: string;
  actions: ChoreAction[];
  onClose: () => void;
}) {
  const tCore = useTranslate('core');
  // guardTaps: a double tap on a choice must not reach the chore row the menu covered.
  return (
    <BottomSheet title={title} onClose={onClose} testId="chore-action-sheet" guardTaps>
      <p style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '-8px 0 14px' }}>{subtitle}</p>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="press-scale"
          data-testid={`chore-action-${action.id}`}
          onClick={() => { action.onSelect(); onClose(); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 52,
            marginBottom: 8, borderRadius: 12, border: 'none', background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-body)', textAlign: 'left', cursor: 'pointer',
          }}
        >
          <span aria-hidden style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--hs-bg-card)', fontWeight: 700 }}>
            {action.mark}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{action.label}</span>
            {action.hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 2 }}>{action.hint}</span>}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        style={{ width: '100%', minHeight: 44, marginTop: 4, border: 'none', background: 'none', color: 'var(--hs-text-faint)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        {tCore('actions.cancel')}
      </button>
    </BottomSheet>
  );
}
