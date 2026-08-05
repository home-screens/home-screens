'use client';

import { useEffect, useRef } from 'react';
import { Undo2 } from 'lucide-react';
import { useTranslate } from '@/i18n';

export interface ToastItem {
  id: string;
  choreId: string;
  memberId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  wasCompleted: boolean;
  /** Override the default "completed"/"uncompleted" verb (e.g. "redeemed"). */
  verb?: string;
}

interface ChoreToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onUndo: (id: string) => void;
}

const TOAST_DURATION = 4000;

function ToastEntry({
  toast,
  onDismiss,
  onUndo,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const t = useTranslate('modules');

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), TOAST_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--fcc-surface)',
        border: '1px solid var(--fcc-border)',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        animation: 'toast-in 200ms ease-out',
        maxWidth: 360,
      }}
    >
      {/* Member color indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: toast.memberColor,
          flexShrink: 0,
        }}
      />

      {/* Message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fcc-text)',
          }}
        >
          {toast.memberName}
        </span>
        <span style={{ fontSize: 14, color: 'var(--fcc-text-2)', marginLeft: 4 }}>
          {toast.verb ?? t(toast.wasCompleted ? 'fullscreen-chore-chart.verbs.completed' : 'fullscreen-chore-chart.verbs.uncompleted')}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fcc-text)', marginLeft: 4 }}>
          {toast.choreName}
        </span>
      </div>

      {/* Undo button — hidden for non-chore toasts (e.g. redemptions) */}
      {toast.choreId && <button
        type="button"
        onClick={() => onUndo(toast.id)}
        className="press-dot"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 44,
          minHeight: 44,
          padding: 0,
          background: 'none',
          border: 'none',
          color: 'var(--fcc-accent)',
          cursor: 'pointer',
          touchAction: 'pan-y',
          borderRadius: 8,
        }}
        aria-label={t(
          toast.wasCompleted
            ? 'fullscreen-chore-chart.ariaLabels.undoCompleting'
            : 'fullscreen-chore-chart.ariaLabels.undoUncompleting',
          { chore: toast.choreName },
        )}
      >
        <Undo2 size={18} />
      </button>}
    </div>
  );
}

export default function ChoreToast({ toasts, onDismiss, onUndo }: ChoreToastProps) {
  // Show at most 3 toasts
  const visible = toasts.slice(-3);

  if (visible.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {visible.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastEntry toast={toast} onDismiss={onDismiss} onUndo={onUndo} />
          </div>
        ))}
      </div>
    </>
  );
}
