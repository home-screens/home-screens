'use client';

import type { ReactNode } from 'react';

export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  confirmColor,
  icon,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor?: string;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--hs-bg-panel)',
          borderRadius: '20px 20px 0 0',
          padding: '24px 16px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          textAlign: icon ? 'center' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && (
          <div style={{ marginBottom: 12 }}>{icon}</div>
        )}
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text-primary)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', lineHeight: 1.5, marginBottom: 24 }}>
          {description}
        </div>
        <button
          className="press-btn"
          onClick={onConfirm}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            background: confirmColor ?? 'var(--hs-danger)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          {confirmLabel}
        </button>
        <button
          className="press-scale"
          onClick={onCancel}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-body)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
