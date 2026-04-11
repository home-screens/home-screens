'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { COMMON_TIMEZONES } from '@/lib/timezone';

interface LocationSettings {
  lat: string;
  lon: string;
  locationName: string | null;
  timezone: string;
}

interface Props {
  values: LocationSettings;
  onChange: (updates: Partial<LocationSettings>) => void;
}

export default function LocationSection({ values, onChange }: Props) {
  const { lat, lon, locationName, timezone } = values;

  const [locationQuery, setLocationQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  const [browserTime, setBrowserTime] = useState(() => new Date());
  const [serverInfo, setServerInfo] = useState<{ offsetMs: number; timezone: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setBrowserTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchServerTime() {
      const fetchedAt = Date.now();
      try {
        const res = await editorFetch('/api/time');
        const data = await res.json();
        const serverMs = new Date(data.iso).getTime();
        setServerInfo({ offsetMs: serverMs - fetchedAt, timezone: data.timezone });
      } catch (err) {
        console.debug('Failed to fetch server time:', err);
      }
    }
    fetchServerTime();
  }, []);

  async function lookupLocation() {
    if (!locationQuery.trim()) return;
    setLocationStatus('Looking up...');
    onChange({ locationName: null });
    try {
      const res = await editorFetch(`/api/geocode?q=${encodeURIComponent(locationQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const newLat = data.latitude.toFixed(4);
        const newLon = data.longitude.toFixed(4);
        onChange({ lat: newLat, lon: newLon, locationName: data.displayName });
        setLocationStatus(`Found: ${data.displayName}`);
      } else {
        const err = await res.json();
        setLocationStatus(`Error: ${err.error}`);
      }
    } catch {
      setLocationStatus('Failed to look up location');
    }
  }

  async function detectViaIP() {
    const res = await editorFetch('/api/geocode?detect=ip');
    if (!res.ok) throw new Error('IP geolocation failed');
    const data = await res.json();
    const newLat = data.latitude.toFixed(4);
    const newLon = data.longitude.toFixed(4);
    onChange({ lat: newLat, lon: newLon, locationName: data.displayName });
    setLocationStatus(`Detected: ${data.displayName} (via IP)`);
  }

  function detectLocation() {
    setLocationStatus('Detecting...');
    onChange({ locationName: null });

    // Browser geolocation requires HTTPS — fall back to IP geolocation on non-secure origins
    if (!navigator.geolocation || window.location.protocol === 'http:') {
      detectViaIP().catch(() => {
        setLocationStatus('Error: Could not detect location');
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude.toFixed(4);
        const newLon = pos.coords.longitude.toFixed(4);
        onChange({ lat: newLat, lon: newLon });
        try {
          const res = await editorFetch(`/api/geocode?q=${newLat},${newLon}`);
          if (res.ok) {
            const data = await res.json();
            onChange({ locationName: data.displayName });
            setLocationStatus(`Detected: ${data.displayName}`);
          } else {
            setLocationStatus(`Detected: ${newLat}, ${newLon}`);
          }
        } catch {
          setLocationStatus(`Detected: ${newLat}, ${newLon}`);
        }
      },
      () => {
        // Geolocation denied or failed — try IP fallback
        detectViaIP().catch(() => {
          setLocationStatus('Error: Could not detect location');
        });
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Location
      </h3>
      <div className="space-y-3">
        <p className="text-xs text-hs-text-faint">
          Used by weather, moon phase, sunrise/sunset, and air quality modules.
        </p>

        <div className="rounded-md bg-hs-card border border-hs-border-strong px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">Browser</span>
            <p className="text-sm text-hs-text-body tabular-nums">
              {browserTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-hs-text-faint">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">Server</span>
            <p className="text-sm text-hs-text-body tabular-nums">
              {serverInfo
                ? new Date(browserTime.getTime() + serverInfo.offsetMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: serverInfo.timezone })
                : <span className="text-hs-text-faint">...</span>}
            </p>
            <p className="text-[10px] text-hs-text-faint">{serverInfo?.timezone ?? ''}</p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-hs-text-muted">Timezone</span>
          <select
            value={timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="">System default ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
            {(() => {
              try {
                return Intl.supportedValuesOf('timeZone').map((tz: string) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ));
              } catch {
                return COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.value.replace(/_/g, ' ')}</option>
                ));
              }
            })()}
          </select>
          <p className="text-xs text-hs-text-faint mt-1">
            Override the server&apos;s OS timezone for clock, greeting, and other time-based modules.
          </p>
        </label>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupLocation()}
              placeholder="Zip code or city name"
              className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            />
            <Button variant="secondary" size="sm" onClick={lookupLocation}>
              Look up
            </Button>
            <Button variant="secondary" size="sm" onClick={detectLocation}>
              Detect
            </Button>
          </div>
          <p
            className={`text-xs ${!locationStatus ? 'sr-only' : locationStatus.startsWith('Error') || locationStatus.startsWith('Failed') ? 'text-hs-danger' : 'text-hs-success'}`}
            aria-live="polite"
            role={locationStatus?.startsWith('Error') || locationStatus?.startsWith('Failed') ? 'alert' : undefined}
          >
            {locationStatus ?? ''}
          </p>
          {(lat && lon) && (
            <p className="text-xs text-hs-text-faint">
              {locationName ? `${locationName} — ` : ''}
              {lat}, {lon}
            </p>
          )}
        </div>

        <details className="text-xs">
          <summary className="text-hs-text-faint cursor-pointer hover:text-hs-text-muted">
            Edit coordinates manually
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <label className="block">
              <span className="text-xs text-hs-text-muted">Latitude</span>
              <input
                type="text"
                value={lat}
                onChange={(e) => onChange({ lat: e.target.value })}
                placeholder="40.7128"
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </label>
            <label className="block">
              <span className="text-xs text-hs-text-muted">Longitude</span>
              <input
                type="text"
                value={lon}
                onChange={(e) => onChange({ lon: e.target.value })}
                placeholder="-74.006"
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </label>
          </div>
        </details>
      </div>
    </section>
  );
}
