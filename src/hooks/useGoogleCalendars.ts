'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { insertInListOrder } from '@/lib/calendar-sources';
import type { ICalSource, ICloudSource } from '@/types/config';
import type { GoogleClientMode } from '@/lib/google-token-store';
import { logger } from '@/lib/logger';

const log = logger('useGoogleCalendars');

export interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
  /** This account may add events on it (owner or writer). */
  writable?: boolean;
}

interface CalendarValues {
  selectedCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources?: ICloudSource[];
  holidayCountry?: string;
}

interface UseGoogleCalendarsOptions {
  values: CalendarValues;
  onChange: (updates: { selectedCalendarIds: string[] }) => void;
  onAuthError: (message: string) => void;
  /** Google was signed in from another tab, and the calendars are listed again. */
  onSignedInElsewhere?: () => void;
}

interface UseGoogleCalendarsReturn {
  credentialsConfigured: boolean;
  /** Which Google app signs in; 'hosted' is Home Screens' own, which gets the new sign-in screens. */
  mode: GoogleClientMode | null;
  googleConnected: boolean;
  googleCalendars: GoogleCalendar[];
  googleLoading: boolean;
  setGoogleConnected: (connected: boolean) => void;
  fetchCalendars: (autoSelectPrimary?: boolean) => Promise<void>;
  toggleCalendar: (id: string) => void;
  disconnectGoogle: () => Promise<boolean>;
}

export function useGoogleCalendars({ values, onChange, onAuthError, onSignedInElsewhere }: UseGoogleCalendarsOptions): UseGoogleCalendarsReturn {
  const t = useTranslate('core');
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [mode, setMode] = useState<GoogleClientMode | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const [googleLoading, setGoogleLoading] = useState(true);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const connectedRef = useRef(googleConnected);
  connectedRef.current = googleConnected;
  const signedInElsewhereRef = useRef(onSignedInElsewhere);
  signedInElsewhereRef.current = onSignedInElsewhere;
  // The callbacks are read through refs so a parent that hands over new ones
  // on every render (the Settings form does, on each staged edit) never
  // makes the hub ask Google again: only a sign-in change does.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const fetchCalendars = useCallback(async (autoSelectPrimary = false) => {
    try {
      const res = await editorFetch('/api/calendars');
      if (res.ok) {
        const cals: GoogleCalendar[] = await res.json();
        setGoogleCalendars(cals);
        // Auto-select primary calendar only on first-ever connection: no
        // calendars picked and no other source — ICS, iCloud, or holidays —
        // configured at all. Disabled sources count as configured: they are
        // deliberate setup, and connecting Google must never silently merge
        // an unrequested calendar into it. Read current values from ref to
        // avoid stale closures and unnecessary refetches.
        const v = valuesRef.current;
        const hasAnyConfiguredSource =
          (v.icalSources?.length ?? 0) > 0 || (v.icloudSources?.length ?? 0) > 0 || !!v.holidayCountry;
        if (autoSelectPrimary && v.selectedCalendarIds.length === 0 && !hasAnyConfiguredSource && cals.length > 0) {
          const primary = cals.find((c) => c.primary);
          if (primary) onChangeRef.current({ selectedCalendarIds: [primary.id] });
        }
      } else if (res.status === 403) {
        // Google tokens missing, expired, or revoked — show reconnect UI with reason
        const errData = await res.json().catch(() => null);
        setGoogleConnected(false);
        onAuthErrorRef.current(errData?.error || t('errors.googleExpired'));
      }
    } catch (err) {
      log.debug('fetchCalendars failed (editorFetch handles 401 session errors):', err);
    }
  }, [t]);

  /** Whether Google is signed in, with the calendars listed when it is. */
  const readStatus = useCallback(async (autoSelectPrimary = false): Promise<boolean> => {
    const res = await editorFetch('/api/auth/google/status');
    // A hub that could not answer has not said the grant is gone: read as
    // "disconnected", a 500 showed "Connect Google" for a grant still on disk.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setCredentialsConfigured(!!data.credentialsConfigured);
    setMode(data.mode === 'own' || data.mode === 'hosted' ? data.mode : null);
    setGoogleConnected(!!data.connected);
    if (data.connected) await fetchCalendars(autoSelectPrimary);
    return !!data.connected;
  }, [fetchCalendars]);

  useEffect(() => {
    readStatus()
      .catch((err) => {
        log.debug('checkAuth failed:', err);
        onAuthErrorRef.current(t('errors.googleStatusFailed'));
      })
      .finally(() => setGoogleLoading(false));
  }, [readStatus, t]);

  // Google's web sign-in, the one that lets Home Screens add events, finishes
  // in a tab of its own and signs in for showing calendars too: look again
  // when the editor comes back to the front.
  useEffect(() => {
    const onFocus = () => {
      if (connectedRef.current) return;
      readStatus(true)
        .then((connected) => { if (connected) signedInElsewhereRef.current?.(); })
        .catch((err) => log.debug('recheck on focus failed:', err));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [readStatus]);

  const toggleCalendar = useCallback((id: string) => {
    const current = valuesRef.current.selectedCalendarIds;
    onChange({
      selectedCalendarIds: current.includes(id)
        ? current.filter((c) => c !== id)
        // Back in its place in Google's list, not at the bottom of every list.
        : insertInListOrder(current, id, (other) => googleCalendars.findIndex((c) => c.id === other)),
    });
  }, [onChange, googleCalendars]);

  /**
   * Forget the grant. The chosen calendars are dropped only once the hub
   * confirms the grant is gone; otherwise a failed request would clear them
   * from the config while the grant stays on disk. Resolves false when the
   * hub refused, with the reason already passed to `onAuthError`.
   */
  const disconnectGoogle = useCallback(async (): Promise<boolean> => {
    try {
      const res = await editorFetch('/api/auth/google/status', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      log.debug('disconnectGoogle failed:', err);
      onAuthError(t('errors.googleDisconnectFailed'));
      return false;
    }
    setGoogleConnected(false);
    setGoogleCalendars([]);
    onChange({ selectedCalendarIds: [] });
    return true;
  }, [onChange, onAuthError, t]);

  return {
    credentialsConfigured,
    mode,
    googleConnected,
    googleCalendars,
    googleLoading,
    setGoogleConnected,
    fetchCalendars,
    toggleCalendar,
    disconnectGoogle,
  };
}
