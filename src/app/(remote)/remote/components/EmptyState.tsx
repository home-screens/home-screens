'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * What a phone tab, a page of one or a list inside a sheet shows when there
 * is nothing in it yet: a large quiet icon, one line in body colour, and a
 * softer line saying what to do. `action` goes under them: a button, or a
 * line saying where to go. Every empty page on the phone is drawn by this, so
 * an empty Meals page reads like an empty list rather than an unfinished one.
 *
 * `style` is for the space around it only (a sheet has less room than a tab).
 */
export default function EmptyState({ icon: Icon, title, body, action, testId, style }: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <div data-testid={testId} style={{ textAlign: 'center', padding: '64px 24px 0', ...style }}>
      <Icon size={44} strokeWidth={1.6} aria-hidden="true" style={{ display: 'block', margin: '0 auto 14px', color: 'var(--hs-border-strong)' }} />
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--hs-text-body)', overflowWrap: 'anywhere' }}>{title}</p>
      {body && <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: 'var(--hs-text-faint)' }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
