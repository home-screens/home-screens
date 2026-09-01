'use client';

import { useEffect, useRef } from 'react';
import { useAlertStore, splitAlerts, type DisplayAlert } from '@/stores/alert-store';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { useTranslate } from '@/i18n';
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
 *
 * The sizes are authored for a wall, not a phone: a banner is read from the
 * couch, and an urgent one from the hallway.
 */
const REF_W = 1080;
const REF_MIN_H = 540;

/** Banner width as a fraction of the viewport. */
export const BANNER_WIDTH_FRACTION = 0.86;

/** Minimum dismiss hit target in physical pixels — never scaled down. */
const MIN_TAP_PX = 44;

const TYPE_COLORS: Record<Exclude<DisplayAlert['type'], 'urgent'>, { border: string; icon: string }> = {
  info: { border: 'rgba(59, 130, 246, 0.55)', icon: '#3b82f6' },
  warning: { border: 'rgba(245, 158, 11, 0.6)', icon: '#f59e0b' },
};

const TYPE_ICONS: Record<Exclude<DisplayAlert['type'], 'urgent'>, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
};

const URGENT_BG = '#dc2626';

function bannerStyle(type: DisplayAlert['type']) {
  return type === 'warning' ? TYPE_COLORS.warning : TYPE_COLORS.info;
}

function BannerItem({ alert, onDismiss, s, label }: { alert: DisplayAlert; onDismiss: (id: string) => void; s: number; label: string }) {
  const colors = bannerStyle(alert.type);
  const Icon = alert.type === 'warning' ? TYPE_ICONS.warning : TYPE_ICONS.info;

  return (
    <div
      data-testid="alert-item"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 22 * s,
        padding: `${26 * s}px ${30 * s}px`,
        borderRadius: 22 * s,
        backgroundColor: 'rgba(20, 22, 28, 0.7)',
        border: `2px solid ${colors.border}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        color: '#fff',
        width: `${BANNER_WIDTH_FRACTION * 100}%`,
        animation: 'alert-slide-in 0.3s ease-out',
        pointerEvents: 'auto',
      }}
    >
      <Icon
        style={{ width: 44 * s, height: 44 * s, color: colors.icon, flexShrink: 0, marginTop: 2 * s }}
        strokeWidth={2.5}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {alert.title && (
          <div data-testid="alert-title" style={{ fontWeight: 700, fontSize: 30 * s, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
            {alert.icon ? `${alert.icon} ` : ''}{alert.title}
          </div>
        )}
        {alert.message && (
          <div style={{
            fontSize: 26 * s,
            lineHeight: 1.3,
            opacity: 0.85,
            marginTop: alert.title ? 6 * s : 0,
          }}>
            {alert.message}
          </div>
        )}
      </div>
      {alert.dismissible !== false && (
        <button
          data-testid="alert-dismiss"
          data-alert-control=""
          onClick={() => onDismiss(alert.id)}
          aria-label={label}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            color: '#fff',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            width: 56 * s,
            height: 56 * s,
            // Physical-pixel floor: these displays are touch kiosks used by
            // kids, and the icon alone is far below a reliable fingertip
            // target. The floor is deliberately NOT multiplied by `s`.
            minWidth: MIN_TAP_PX,
            minHeight: MIN_TAP_PX,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -4 * s,
          }}
        >
          <X style={{ width: 28 * s, height: 28 * s }} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/**
 * The urgent bar: one solid full-width band at the top edge, whatever the
 * configured banner position. It is measured and published to the alert
 * store so ScreenRotator can push the canvas down under it.
 */
function UrgentBar({ alert, onDismiss, s, label }: { alert: DisplayAlert; onDismiss: (id: string) => void; s: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const setUrgentInset = useAlertStore((st) => st.setUrgentInset);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => setUrgentInset(el.getBoundingClientRect().height);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setUrgentInset(0);
    };
  }, [setUrgentInset]);

  return (
    <div
      ref={ref}
      data-testid="alert-urgent"
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: DISPLAY_LAYERS.alert,
        display: 'flex',
        alignItems: 'center',
        gap: 32 * s,
        padding: `${40 * s}px ${56 * s}px ${44 * s}px`,
        backgroundColor: URGENT_BG,
        color: '#fff',
        boxShadow: `0 ${20 * s}px ${60 * s}px rgba(220, 38, 38, 0.45)`,
        animation: 'alert-slide-in 0.3s ease-out',
        pointerEvents: 'auto',
      }}
    >
      {/* Hazard stripe along the top edge. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 10 * s, opacity: 0.55,
        background: `repeating-linear-gradient(90deg, #fff 0 ${40 * s}px, transparent ${40 * s}px ${80 * s}px)`,
      }} />
      <AlertCircle style={{ width: 84 * s, height: 84 * s, flexShrink: 0 }} strokeWidth={2.4} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {alert.title && (
          <div data-testid="alert-title" style={{ fontWeight: 800, fontSize: 46 * s, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
            {alert.icon ? `${alert.icon} ` : ''}{alert.title}
          </div>
        )}
        {alert.message && (
          <div style={{ fontSize: 32 * s, lineHeight: 1.3, opacity: 0.95, marginTop: alert.title ? 8 * s : 0 }}>
            {alert.message}
          </div>
        )}
      </div>
      {alert.dismissible !== false && (
        <button
          data-testid="alert-dismiss"
          data-alert-control=""
          onClick={() => onDismiss(alert.id)}
          style={{
            flexShrink: 0,
            fontSize: 28 * s,
            fontWeight: 700,
            padding: `${18 * s}px ${30 * s}px`,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            border: '2px solid rgba(255,255,255,0.7)',
            color: '#fff',
            cursor: 'pointer',
            minWidth: MIN_TAP_PX,
            minHeight: MIN_TAP_PX,
            fontFamily: 'inherit',
          }}
        >
          {label}
        </button>
      )}
    </div>
  );
}

export default function AlertOverlay({ alertSettings, displayState = 'active', viewport }: AlertOverlayProps) {
  const { alerts, maxVisible, position, enabled, configure, dismissAlert, urgentInsetPx } = useAlertStore();
  const t = useTranslate('core');

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

  if (!enabled || alerts.length === 0) return null;
  // Not yet measured — skip the frame rather than flash unscaled banners.
  if (!viewport || viewport.w <= 0) return null;

  const { urgent, banners } = splitAlerts(alerts, maxVisible);
  // A sleeping or dimmed display shows only an urgent bar (which also wakes
  // it — see useDisplayControl); routine banners wait for an active display.
  const active = displayState === 'active';
  if (!active && !urgent) return null;

  // Viewport fit × the user's size knob (alerts.scale stays a multiplier).
  const fit = Math.min(viewport.w / REF_W, viewport.h / REF_MIN_H);
  const s = fit * (alertSettings?.scale ?? 1);

  const atTop = position === 'top';
  const scrim = atTop
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.72) 75%, rgba(0,0,0,0) 100%)'
    : 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.72) 75%, rgba(0,0,0,0) 100%)';

  return (
    <>
      <style>{`
        @keyframes alert-slide-in {
          from { opacity: 0; transform: translateY(var(--alert-slide-offset, -12px)); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {urgent && <UrgentBar alert={urgent} onDismiss={dismissAlert} s={s} label={t('alerts.dismiss')} />}
      {active && banners.length > 0 && (
        <div
          data-testid="alert-stack"
          style={{
            '--alert-slide-offset': atTop ? `-${12 * s}px` : `${12 * s}px`,
            position: 'fixed',
            left: 0,
            right: 0,
            // Below the urgent bar when one is up, never over it.
            [atTop ? 'top' : 'bottom']: atTop && urgent ? urgentInsetPx : 0,
            zIndex: DISPLAY_LAYERS.alert,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16 * s,
            // The scrim runs ~90px past the last banner, so the stack reads
            // against a bright photo screen without hiding the layout.
            padding: atTop ? `${28 * s}px 0 ${90 * s}px` : `${90 * s}px 0 ${28 * s}px`,
            background: scrim,
            pointerEvents: 'none',
          } as React.CSSProperties}
        >
          {banners.map((alert) => (
            <BannerItem key={alert.id} alert={alert} onDismiss={dismissAlert} s={s} label={t('alerts.dismiss')} />
          ))}
        </div>
      )}
    </>
  );
}
