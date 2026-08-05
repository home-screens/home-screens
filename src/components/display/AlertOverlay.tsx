'use client';

import { useEffect } from 'react';
import { useAlertStore, type DisplayAlert } from '@/stores/alert-store';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import type { AlertSettings } from '@/types/config';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface AlertOverlayProps {
  alertSettings?: AlertSettings;
  displayState?: 'active' | 'dimmed' | 'asleep';
  /**
   * Measured viewport from ScreenRotator. Alerts scale with the viewport so
   * they hold a consistent fraction of any display — never with the
   * configured canvas, whose fit factor shrank alerts to unreadability
   * whenever canvas and viewport disagreed.
   */
  viewport?: { w: number; h: number };
}

/**
 * Reference viewport the alert sizes below are authored against (the standard
 * portrait kiosk). Width drives the scale so banners stay a constant fraction
 * of the display; the height term only guards ultra-short screens (wider than
 * 2:1), where width-proportional banners would swallow the whole panel.
 */
const REF_W = 1080;
const REF_MIN_H = 540;

/** Minimum dismiss hit target in physical pixels — never scaled down. */
const MIN_TAP_PX = 44;

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

function AlertItem({ alert, onDismiss, s }: { alert: DisplayAlert; onDismiss: (id: string) => void; s: number }) {
  const colors = TYPE_COLORS[alert.type] ?? TYPE_COLORS.info;
  const Icon = TYPE_ICONS[alert.type] ?? TYPE_ICONS.info;

  return (
    <div
      data-testid="alert-item"
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
          data-testid="alert-dismiss"
          onClick={() => onDismiss(alert.id)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            // Physical-pixel floor: these displays are touch kiosks used by
            // kids, and the icon alone is far below a reliable fingertip
            // target. The floor is deliberately NOT multiplied by `s`.
            minWidth: MIN_TAP_PX,
            minHeight: MIN_TAP_PX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Recenter the oversized hit box against the text block so the
            // banner doesn't visibly grow at small scales.
            margin: `${-10 * s}px ${-10 * s}px ${-10 * s}px 0`,
          }}
        >
          <X style={{ width: 16 * s, height: 16 * s }} />
        </button>
      )}
    </div>
  );
}

export default function AlertOverlay({ alertSettings, displayState = 'active', viewport }: AlertOverlayProps) {
  const { alerts, maxVisible, position, enabled, configure, dismissAlert } = useAlertStore();

  // Sync store config whenever settings change
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

  if (!enabled || alerts.length === 0 || displayState !== 'active') return null;
  // Not yet measured — skip the frame rather than flash unscaled banners.
  if (!viewport || viewport.w <= 0) return null;

  // Viewport fit × the user's size knob (alerts.scale stays a multiplier).
  const fit = Math.min(viewport.w / REF_W, viewport.h / REF_MIN_H);
  const s = fit * (alertSettings?.scale ?? 1);

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
          '--alert-slide-offset': position === 'top' ? `-${12 * s}px` : `${12 * s}px`,
          position: 'fixed',
          left: 0,
          right: 0,
          [position === 'top' ? 'top' : 'bottom']: 0,
          zIndex: DISPLAY_LAYERS.alert,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8 * s,
          padding: `${16 * s}px ${24 * s}px`,
          pointerEvents: 'none',
        } as React.CSSProperties}
      >
        {visible.map((alert) => (
          <AlertItem key={alert.id} alert={alert} onDismiss={dismissAlert} s={s} />
        ))}
      </div>
    </>
  );
}
