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

  showAlert: (alert: Omit<DisplayAlert, 'id'>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  configure: (opts: { maxVisible?: number; position?: 'top' | 'bottom'; enabled?: boolean; defaultDuration?: number }) => void;
}

let counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  maxVisible: 3,
  position: 'top',
  enabled: true,
  defaultDuration: 0,

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

    set((state) => ({
      alerts: [...state.alerts, newAlert],
    }));

    if (duration > 0) {
      const handle = setTimeout(() => {
        timers.delete(id);
        get().dismissAlert(id);
      }, duration);
      timers.set(id, handle);
    }
  },

  dismissAlert: (id) => {
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.delete(id);
    }
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
}));
