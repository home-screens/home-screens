'use client';

export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
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
          background: '#1a1a1a',
          borderRadius: '20px 20px 0 0',
          padding: '24px 16px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: '#737373', lineHeight: 1.5, marginBottom: 24 }}>
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
            background: '#ef4444',
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
            background: 'rgba(255,255,255,0.08)',
            color: '#e5e5e5',
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
