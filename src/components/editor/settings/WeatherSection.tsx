'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
import Button from '@/components/ui/Button';

type SecretKey = 'openweathermap_key' | 'weatherapi_key' | 'pirateweather_key' | null;

interface WeatherSettings {
  provider: string;
  units: string;
  lat: string;
  lon: string;
}

interface Props {
  values: WeatherSettings;
  onChange: (updates: Partial<WeatherSettings>) => void;
}

function providerSecretKey(provider: string): SecretKey {
  if (provider === 'openweathermap') return 'openweathermap_key';
  if (provider === 'pirateweather') return 'pirateweather_key';
  if (provider === 'noaa' || provider === 'open-meteo') return null;
  return 'weatherapi_key';
}

const needsApiKey = (provider: string) => provider !== 'noaa' && provider !== 'open-meteo';

export default function WeatherSection({ values, onChange }: Props) {
  const { provider, units, lat, lon } = values;
  const { updateSettings, saveConfig } = useEditorStore();

  const [apiKey, setApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const fetchKeyStatus = useCallback(async () => {
    const key = providerSecretKey(provider);
    if (!key) {
      // NOAA needs no API key — always "configured"
      setKeyConfigured(true);
      setKeyLoading(false);
      return;
    }
    try {
      const res = await editorFetch('/api/secrets');
      if (res.ok) {
        const data: Partial<Record<string, boolean>> = await res.json();
        setKeyConfigured(!!data[key]);
      }
    } catch (err) {
      console.debug('Failed to fetch API key status:', err);
    } finally {
      setKeyLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    setKeyLoading(true);
    fetchKeyStatus();
  }, [fetchKeyStatus]);

  async function handleSaveKey(): Promise<boolean> {
    if (!apiKey.trim()) return false;
    setSaveStatus('saving');
    setSaveError('');
    try {
      const res = await editorFetch('/api/secrets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: providerSecretKey(provider), value: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus('error');
        setSaveError(data.error ?? 'Failed to save');
        return false;
      }
      setSaveStatus('saved');
      setApiKey('');
      await fetchKeyStatus();
      setTimeout(() => setSaveStatus('idle'), 3000);
      return true;
    } catch {
      setSaveStatus('error');
      setSaveError('Network error');
      return false;
    }
  }

  async function handleDeleteKey() {
    try {
      const res = await editorFetch('/api/secrets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: providerSecretKey(provider) }),
      });
      if (res.ok) await fetchKeyStatus();
    } catch (err) {
      console.debug('Failed to delete API key:', err);
    }
  }

  async function testWeather() {
    // If user typed a key but hasn't saved, save first (not needed for NOAA)
    if (needsApiKey(provider) && apiKey.trim()) {
      const saved = await handleSaveKey();
      if (!saved) return;
    }

    setTestStatus('Testing...');
    try {
      const testLat = parseFloat(lat) || 0;
      const testLon = parseFloat(lon) || 0;
      updateSettings({
        latitude: testLat,
        longitude: testLon,
        weather: {
          provider: provider as 'openweathermap' | 'weatherapi' | 'pirateweather' | 'noaa' | 'open-meteo',
          latitude: testLat,
          longitude: testLon,
          units: units as 'metric' | 'imperial',
        },
      });
      await saveConfig();

      const res = await editorFetch(
        `/api/weather?provider=${provider}&lat=${lat}&lon=${lon}&units=${units}&type=hourly`
      );
      if (res.ok) {
        const data = await res.json();
        const hourly = data.hourly ?? data;
        if (Array.isArray(hourly) && hourly.length > 0) {
          setTestStatus(`Working! Current temp: ${Math.round(hourly[0].temp)}°`);
        } else {
          setTestStatus('Connected but no data returned');
        }
      } else {
        const err = await res.json();
        setTestStatus(`Error: ${err.error}`);
      }
    } catch (e) {
      setTestStatus(`Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  const hasLocation = parseFloat(lat) !== 0 || parseFloat(lon) !== 0;

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Weather
      </h3>
      <div className="space-y-3">
        {!hasLocation && (
          <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2">
            <p className="text-xs text-hs-warning">
              Set your location for weather to work. Enter a zip code or city name, or use Detect.
            </p>
          </div>
        )}
        <label className="block">
          <span className="text-xs text-hs-text-muted">Provider</span>
          <select
            value={provider}
            onChange={(e) => onChange({ provider: e.target.value })}
            className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="open-meteo">Open-Meteo (free, no key, global)</option>
            <option value="weatherapi">WeatherAPI.com (free, no credit card)</option>
            <option value="openweathermap">OpenWeatherMap (One Call 3.0)</option>
            <option value="pirateweather">Pirate Weather (Dark Sky replacement)</option>
            <option value="noaa">NOAA / NWS (free, US only, no key)</option>
          </select>
        </label>

        {needsApiKey(provider) ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-hs-text-muted">
                API Key
                {provider === 'weatherapi' && (
                  <span className="text-hs-text-faint ml-1">
                    — get one free at weatherapi.com
                  </span>
                )}
                {provider === 'openweathermap' && (
                  <span className="text-hs-text-faint ml-1">
                    — requires One Call 3.0 subscription
                  </span>
                )}
                {provider === 'pirateweather' && (
                  <span className="text-hs-text-faint ml-1">
                    — free at pirateweather.net
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {!keyLoading && (
                  <>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`w-1.5 h-1.5 rounded-full inline-block ${
                          keyConfigured ? 'bg-hs-success' : 'bg-hs-card'
                        }`}
                      />
                      <span className={keyConfigured ? 'text-hs-success' : 'text-hs-text-faint'}>
                        {keyConfigured ? 'Configured' : 'Not configured'}
                      </span>
                    </span>
                    {keyConfigured && (
                      <button
                        onClick={handleDeleteKey}
                        className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaveStatus('idle'); }}
                placeholder="Paste your API key here"
                className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? '...' : 'Save'}
              </Button>
            </div>
            {saveStatus === 'saved' && (
              <span className="text-xs text-hs-success">Key saved successfully</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-xs text-hs-danger">{saveError}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-hs-success/80">
            {provider === 'noaa'
              ? 'No API key required — NOAA data is free and public (US only).'
              : 'No API key required — Open-Meteo is free and open-source with global coverage.'}
          </p>
        )}

        <label className="block">
          <span className="text-xs text-hs-text-muted">Units</span>
          <select
            value={units}
            onChange={(e) => onChange({ units: e.target.value })}
            className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="imperial">Imperial (°F, mph)</option>
            <option value="metric">Metric (°C, km/h)</option>
          </select>
        </label>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={testWeather}>
            Test Weather Connection
          </Button>
          {testStatus && (
            <span className={`text-xs ${testStatus.startsWith('Working') ? 'text-hs-success' : testStatus.startsWith('Error') || testStatus.startsWith('Failed') ? 'text-hs-danger' : 'text-hs-text-muted'}`}>
              {testStatus}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
