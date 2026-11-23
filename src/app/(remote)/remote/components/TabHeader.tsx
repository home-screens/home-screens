'use client';

import type { CSSProperties, ReactNode, Ref } from 'react';
import { Settings } from 'lucide-react';

/**
 * The heading every phone tab opens with: one 22 px title, an optional
 * eyebrow line over it (the weekday on the day-based tabs, Chores and Meals),
 * and the tab's own buttons on the right. `leading` sits just before the
 * title, outside the heading (the hub's status dot on Control).
 *
 * `titleRef` and `eyebrowRef` let a tab measure its words (Meals does, to
 * fit Rate dinner beside them).
 */
export default function TabHeader({ title, eyebrow, actions, leading, titleRef, eyebrowRef, style }: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  titleRef?: Ref<HTMLSpanElement>;
  eyebrowRef?: Ref<HTMLSpanElement>;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 0 12px', ...style }}>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--hs-text-faint)', whiteSpace: 'nowrap' }}>
            <span ref={eyebrowRef} style={{ display: 'inline-block' }}>{eyebrow}</span>
          </div>
        )}
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: 'var(--hs-text-primary)' }}>
          <span ref={titleRef} style={{ display: 'inline-block' }}>{title}</span>
        </h2>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>{actions}</div>}
    </div>
  );
}

/** The look of a 44 px button in a tab's heading row: the gear, and Meals' Rate dinner beside it. */
export const HEADER_BUTTON: CSSProperties = {
  flex: 'none',
  height: 44,
  minWidth: 44,
  padding: 0,
  borderRadius: 12,
  border: '1px solid var(--hs-border)',
  background: 'var(--hs-bg-panel)',
  color: 'var(--hs-text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

/** The settings gear of a tab or a list: one shape and size wherever it is. */
export function GearButton({ label, onClick, title, testId, style }: {
  label: string;
  onClick: () => void;
  title?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      data-testid={testId}
      className="press-scale-sm"
      style={{ ...HEADER_BUTTON, width: 44, ...style }}
    >
      <Settings size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
