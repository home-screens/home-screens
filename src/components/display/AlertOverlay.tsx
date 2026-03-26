'use client';

import { useEffect } from 'react';
import { useAlertStore, type DisplayAlert } from '@/stores/alert-store';
import type { AlertSettings } from '@/types/config';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface AlertOverlayProps {
  alertSettings?: AlertSettings;
  displayState?: 'active' | 'dimmed' | 'asleep';
  scale?: number;
}

const TYPE_COLORS: Record<DisplayAlert['type'], { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.4)',
    icon: '#3b82f6',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.4)',
    icon: '#f59e0b',
  },
  urgent: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '#ef4444',
  },
};

const TYPE_ICONS: Record<DisplayAlert['type'], typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  urgent: AlertCircle,
};

function AlertItem({ alert, onDismiss, alertScale = 1 }: { alert: DisplayAlert; onDismiss: (id: string) => void; alertScale?: number }) {
  const colors = TYPE_COLORS[alert.type] ?? TYPE_COLORS.info;
  const Icon = TYPE_ICONS[alert.type] ?? TYPE_ICONS.info;
  const s = alertScale;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12 * s,
        padding: `${12 * s}px ${16 * s}px`,
        borderRadius: 12 * s,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: '#fff',
        maxWidth: 480 * s,
        width: '100%',
        animation: 'alert-slide-in 0.3s ease-out',
        pointerEvents: 'auto',
      }}
    >
      <Icon
        style={{ width: 20 * s, height: 20 * s, color: colors.icon, flexShrink: 0, marginTop: 2 * s }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {alert.title && (
          <div style={{ fontWeight: 600, fontSize: 14 * s, lineHeight: `${20 * s}px` }}>
            {alert.icon ? `${alert.icon} ` : ''}{alert.title}
          </div>
        )}
        {alert.message && (
          <div style={{
            fontSize: 13 * s,
            lineHeight: `${18 * s}px`,
            opacity: 0.85,
            marginTop: alert.title ? 2 * s : 0,
          }}>
            {alert.message}
          </div>
        )}
      </div>
      {alert.dismissible !== false && (
        <button
          onClick={() => onDismiss(alert.id)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: 2 * s,
            flexShrink: 0,
            marginTop: 1 * s,
          }}
        >
          <X style={{ width: 16 * s, height: 16 * s }} />
        </button>
      )}
    </div>
  );
}

export default function AlertOverlay({ alertSettings, displayState = 'active', scale = 1 }: AlertOverlayProps) {
  const { alerts, maxVisible, position, enabled, configure, dismissAlert } = useAlertStore();

  // Sync store config whenever settings change
  // Note: scale is read directly at render time, not stored in alert-store
  useEffect(() => {
    configure({
      enabled: alertSettings?.enabled ?? true,
      position: alertSettings?.position ?? 'top',
      maxVisible: alertSettings?.maxVisible ?? 3,
      defaultDuration: alertSettings?.defaultDuration ?? 0,
    });
  }, [
    alertSettings?.enabled,
    alertSettings?.position,
    alertSettings?.maxVisible,
    alertSettings?.defaultDuration,
    configure,
  ]);

  const alertScale = alertSettings?.scale ?? 1;

  if (!enabled || alerts.length === 0 || displayState !== 'active') return null;

  const visible = alerts.slice(-maxVisible);

  return (
    <>
      <style>{`
        @keyframes alert-slide-in {
          from { opacity: 0; transform: translateY(var(--alert-slide-offset)); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          '--alert-slide-offset': position === 'top' ? `-${12 * alertScale}px` : `${12 * alertScale}px`,
          position: 'fixed',
          left: 0,
          right: 0,
          [position === 'top' ? 'top' : 'bottom']: 0,
          zIndex: 9998, // Same as Screensaver, but they're never visible simultaneously (alerts only render when active)
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8 * alertScale,
          padding: `${16 * alertScale}px ${24 * alertScale}px`,
          pointerEvents: 'none',
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: position === 'top' ? 'top center' : 'bottom center',
        } as React.CSSProperties}
      >
        {visible.map((alert) => (
          <AlertItem key={alert.id} alert={alert} onDismiss={dismissAlert} alertScale={alertScale} />
        ))}
      </div>
    </>
  );
}
