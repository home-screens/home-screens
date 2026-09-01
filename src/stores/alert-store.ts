import { create } from 'zustand';
import type { AlertType } from '@/types/config';

export interface DisplayAlert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  icon?: string;
  duration?: number; // ms — null/undefined means use type-based default
  dismissible?: boolean;
  /**
   * Wake a sleeping display for this alert even when it is not `urgent`.
   * Urgent alerts always wake; see useDisplayControl.showAlert.
   */
  wake?: boolean;
}

/** Per-type default durations (ms). Urgent alerts are persistent by default. */
const TYPE_DEFAULTS: Record<AlertType, number> = {
  info: 10_000,
  warning: 30_000,
  urgent: 0, // 0 = persistent until dismissed
};

interface AlertState {
  alerts: DisplayAlert[];
  maxVisible: number;
  position: 'top' | 'bottom';
  enabled: boolean;
  defaultDuration: number; // 0 = use per-type defaults
  /**
   * Measured height of the urgent bar currently on screen, in viewport px
   * (0 while none is showing). Published by AlertOverlay; ScreenRotator
   * scales the canvas under it so the bar never covers the layout.
   */
  urgentInsetPx: number;

  showAlert: (alert: Omit<DisplayAlert, 'id'>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  configure: (opts: { maxVisible?: number; position?: 'top' | 'bottom'; enabled?: boolean; defaultDuration?: number }) => void;
  setUrgentInset: (px: number) => void;
}

/**
 * The urgent bar and the stacked banners are drawn from one list. There is
 * at most one urgent alert (a newer one replaces the older — see showAlert),
 * and `maxVisible` caps only the banners: a tornado warning must never be
 * the alert that falls off the stack because three dinner reminders arrived.
 */
export function splitAlerts(alerts: DisplayAlert[], maxVisible: number): { urgent: DisplayAlert | null; banners: DisplayAlert[] } {
  let urgent: DisplayAlert | null = null;
  const banners: DisplayAlert[] = [];
  for (const a of alerts) {
    if (a.type === 'urgent') urgent = a;
    else banners.push(a);
  }
  return { urgent, banners: banners.slice(-Math.max(0, maxVisible)) };
}

let counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string) {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  maxVisible: 3,
  position: 'top',
  enabled: true,
  defaultDuration: 0,
  urgentInsetPx: 0,

  showAlert: (alert) => {
    if (!get().enabled) return;
    const id = `alert-${Date.now()}-${++counter}`;
    const configDefault = get().defaultDuration;
    const duration = alert.duration ?? (configDefault > 0 ? configDefault : TYPE_DEFAULTS[alert.type]);
    const newAlert: DisplayAlert = {
      ...alert,
      id,
      duration,
      dismissible: alert.dismissible ?? true,
    };

    set((state) => {
      // One urgent bar at a time: a newer urgent replaces the older one's
      // text instead of stacking a second bar (and drops its timer).
      let alerts = state.alerts;
      if (newAlert.type === 'urgent') {
        for (const a of alerts) if (a.type === 'urgent') clearTimer(a.id);
        alerts = alerts.filter((a) => a.type !== 'urgent');
      }
      return { alerts: [...alerts, newAlert] };
    });

    if (duration > 0) {
      const handle = setTimeout(() => {
        timers.delete(id);
        get().dismissAlert(id);
      }, duration);
      timers.set(id, handle);
    }
  },

  dismissAlert: (id) => {
    clearTimer(id);
    if (!get().alerts.some((a) => a.id === id)) return;
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    }));
  },

  clearAlerts: () => {
    for (const handle of timers.values()) {
      clearTimeout(handle);
    }
    timers.clear();
    if (get().alerts.length === 0) return;
    set({ alerts: [] });
  },

  configure: (opts) => {
    set({
      ...(opts.maxVisible !== undefined ? { maxVisible: opts.maxVisible } : {}),
      ...(opts.position !== undefined ? { position: opts.position } : {}),
      ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
      ...(opts.defaultDuration !== undefined ? { defaultDuration: opts.defaultDuration } : {}),
    });
  },

  setUrgentInset: (px) => {
    const next = Math.max(0, Math.round(px));
    if (get().urgentInsetPx === next) return;
    set({ urgentInsetPx: next });
  },
}));
