'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import type { ICalSource, ICloudSource } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('useGoogleCalendars');

export interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
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
}

interface UseGoogleCalendarsReturn {
  credentialsConfigured: boolean;
  googleConnected: boolean;
  googleCalendars: GoogleCalendar[];
  googleLoading: boolean;
  setGoogleConnected: (connected: boolean) => void;
  fetchCalendars: (autoSelectPrimary?: boolean) => Promise<void>;
  toggleCalendar: (id: string) => void;
  disconnectGoogle: () => Promise<void>;
}

export function useGoogleCalendars({ values, onChange, onAuthError }: UseGoogleCalendarsOptions): UseGoogleCalendarsReturn {
  const t = useTranslate('core');
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const [googleLoading, setGoogleLoading] = useState(true);
  const valuesRef = useRef(values);
  valuesRef.current = values;

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
          if (primary) onChange({ selectedCalendarIds: [primary.id] });
        }
      } else if (res.status === 403) {
        // Google tokens missing, expired, or revoked — show reconnect UI with reason
        const errData = await res.json().catch(() => null);
        setGoogleConnected(false);
        onAuthError(errData?.error || t('errors.googleExpired'));
      }
    } catch (err) {
      log.debug('fetchCalendars failed (editorFetch handles 401 session errors):', err);
    }
  }, [onChange, onAuthError, t]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await editorFetch('/api/auth/google/status');
        const data = await res.json();
        setCredentialsConfigured(!!data.credentialsConfigured);
        setGoogleConnected(data.connected);
        if (data.connected) await fetchCalendars();
      } catch (err) {
        log.debug('checkAuth failed:', err);
      } finally {
        setGoogleLoading(false);
      }
    }
    checkAuth();
  }, [fetchCalendars]);

  const toggleCalendar = useCallback((id: string) => {
    const current = valuesRef.current.selectedCalendarIds;
    const next = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id];
    onChange({ selectedCalendarIds: next });
  }, [onChange]);

  const disconnectGoogle = useCallback(async () => {
    await editorFetch('/api/auth/google/status', { method: 'DELETE' });
    setGoogleConnected(false);
    setGoogleCalendars([]);
    onChange({ selectedCalendarIds: [] });
  }, [onChange]);

  return {
    credentialsConfigured,
    googleConnected,
    googleCalendars,
    googleLoading,
    setGoogleConnected,
    fetchCalendars,
    toggleCalendar,
    disconnectGoogle,
  };
}
