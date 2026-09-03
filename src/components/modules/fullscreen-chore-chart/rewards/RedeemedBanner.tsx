'use client';

import React from 'react';
import { PartyPopper } from 'lucide-react';

interface RedeemedBannerProps {
  title: string;
  body: string;
  k: number;
  t: number;
  d: number;
  onAccent: string;
  onDismiss: () => void;
}

/**
 * The "you got it" moment after a redemption: a big accent bar over the
 * store for a few seconds, tap to dismiss early. Sized from t so it reads
 * from across the kitchen like everything else on the wall.
 */
export default function RedeemedBanner({ title, body, k, t, d, onAccent, onDismiss }: RedeemedBannerProps) {
  return (
    <div
      data-testid="fcc-redeemed"
      role="status"
      onClick={onDismiss}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 40 * k * d,
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100% - 80px)',
        display: 'flex',
        alignItems: 'center',
        gap: 20 * k * d,
        padding: `${20 * k * d}px ${40 * k * d}px`,
        borderRadius: 32 * k,
        background: 'var(--fcc-accent)',
        color: onAccent,
        boxShadow: '0 12px 50px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        zIndex: 90,
      }}
    >
      <PartyPopper size={56 * t} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 * k * d, minWidth: 0 }}>
        <div style={{ fontSize: 34 * t, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 24 * t, fontWeight: 600, lineHeight: 1.25, opacity: 0.9 }}>{body}</div>
      </div>
    </div>
  );
}
