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
  /** Text scale: 1 draws 24px text, sized for a 1080-wide wall panel. */
  scale?: number;
  /** Distance from the bottom edge, so the toast clears the footer. */
  bottom?: number;
}

const TOAST_DURATION = 4000;

function ToastEntry({
  toast,
  scale,
  onDismiss,
  onUndo,
}: {
  toast: ToastItem;
  scale: number;
  onDismiss: (id: string) => void;
  onUndo: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const t = useTranslate('modules');
  const fontSize = 24 * scale;

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), TOAST_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: fontSize * 0.5,
        padding: `${fontSize * 0.55}px ${fontSize * 0.8}px`,
        background: 'var(--fcc-surface)',
        border: '1px solid var(--fcc-border)',
        borderLeft: `${Math.max(4, fontSize * 0.25)}px solid ${toast.memberColor}`,
        borderRadius: fontSize * 0.6,
        boxShadow: '0 6px 32px rgba(0,0,0,0.35)',
        animation: 'toast-in 200ms ease-out',
        maxWidth: fontSize * 28,
        fontSize,
        lineHeight: 1.25,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: 'var(--fcc-text)' }}>{toast.memberName}</span>
        <span style={{ color: 'var(--fcc-text-2)', marginLeft: fontSize * 0.25 }}>
          {toast.verb ?? t(toast.wasCompleted ? 'fullscreen-chore-chart.verbs.completed' : 'fullscreen-chore-chart.verbs.uncompleted')}
        </span>
        <span style={{ fontWeight: 700, color: 'var(--fcc-text)', marginLeft: fontSize * 0.25 }}>{toast.choreName}</span>
      </div>

      {/* Undo: hidden for non-chore toasts (e.g. redemptions) */}
      {toast.choreId && <button
        type="button"
        onClick={() => onUndo(toast.id)}
        className="press-dot"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: Math.max(44, fontSize * 2),
          minHeight: Math.max(44, fontSize * 2),
          padding: 0,
          background: 'none',
          border: 'none',
          color: 'var(--fcc-accent)',
          cursor: 'pointer',
          touchAction: 'pan-y',
          borderRadius: fontSize * 0.4,
        }}
        aria-label={t(
          toast.wasCompleted
            ? 'fullscreen-chore-chart.ariaLabels.undoCompleting'
            : 'fullscreen-chore-chart.ariaLabels.undoUncompleting',
          { chore: toast.choreName },
        )}
      >
        <Undo2 size={fontSize * 1.1} />
      </button>}
    </div>
  );
}

export default function ChoreToast({ toasts, onDismiss, onUndo, scale = 1, bottom = 16 }: ChoreToastProps) {
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
          bottom,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8 * scale,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {visible.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastEntry toast={toast} scale={scale} onDismiss={onDismiss} onUndo={onUndo} />
          </div>
        ))}
      </div>
    </>
  );
}
