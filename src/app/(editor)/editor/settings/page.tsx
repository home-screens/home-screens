'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/stores/editor-store';
import type { GlobalSettings } from '@/types/config';
import {
  ArrowLeft,
  Monitor,
  Moon,
  MapPin,
  CloudSun,
  Calendar,
  Plug,
  Server,
  Database,
  Shield,
  Layers,
  Activity,
  Bell,
  BookOpen,
} from 'lucide-react';

import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import Button from '@/components/ui/Button';
import DisplaySection from '@/components/editor/settings/DisplaySection';
import SleepSection from '@/components/editor/settings/SleepSection';
import LocationSection from '@/components/editor/settings/LocationSection';
import WeatherSection from '@/components/editor/settings/WeatherSection';
import IntegrationsSection from '@/components/editor/settings/IntegrationsSection';
import CalendarSection from '@/components/editor/settings/CalendarSection';
import ProfilesSection from '@/components/editor/settings/ProfilesSection';
import SystemSection from '@/components/editor/settings/SystemSection';
import SecuritySection from '@/components/editor/settings/SecuritySection';
import StatsSection from '@/components/editor/settings/StatsSection';
import AlertSection from '@/components/editor/settings/AlertSection';
import DataSection from '@/components/editor/settings/DataSection';
import DocsSection from '@/components/editor/settings/DocsSection';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import UpgradeModal from '@/components/editor/UpgradeModal';
import { countOffCanvasModules, totalModuleCount } from '@/lib/module-utils';

/* ─── Tab definitions ─────────────────────────────── */

const TABS = [
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'profiles', label: 'Profiles', icon: Layers },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'weather', label: 'Weather', icon: CloudSun },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'stats', label: 'Stats', icon: Activity },
  { id: 'system', label: 'System', icon: Server },
  { id: 'docs', label: 'Docs', icon: BookOpen },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ─── Settings state ──────────────────────────────── */

interface DisplayState {
  displayWidth: number;
  displayHeight: number;
  displayTransform: string;
  rotationInterval: number;
  cursorHideSeconds: number;
  transitionEffect: string;
  transitionDuration: number;
}

interface LocationState {
  lat: string;
  lon: string;
  locationName: string | null;
  timezone: string;
}

interface WeatherState {
  provider: string;
  units: string;
}

interface CalendarState {
  selectedCalendarIds: string[];
  icalSources: import('@/types/config').ICalSource[];
  maxEvents: number;
  daysAhead: number;
  holidayCountry: string;
}

interface SleepState {
  sleepEnabled: boolean;
  dimAfterMinutes: number;
  sleepAfterMinutes: number;
  dimBrightness: number;
  dimScheduleEnabled: boolean;
  dimStartTime: string;
  dimEndTime: string;
  sleepScheduleEnabled: boolean;
  sleepStartTime: string;
  sleepEndTime: string;
  screensaverMode: string;
}

interface AlertState {
  alertsEnabled: boolean;
  alertsPosition: string;
  alertsMaxVisible: number;
  alertsDefaultDuration: number;
  alertsScale: number;
}

interface SettingsState {
  display: DisplayState;
  location: LocationState;
  weather: WeatherState;
  calendar: CalendarState;
  sleep: SleepState;
  alerts: AlertState;
}

function initSettings(settings: GlobalSettings | undefined): SettingsState {
  return {
    display: {
      rotationInterval: (settings?.rotationIntervalMs ?? 30000) / 1000,
      displayWidth: settings?.displayWidth ?? 1080,
      displayHeight: settings?.displayHeight ?? 1920,
      displayTransform: settings?.displayTransform ?? '90',
      cursorHideSeconds: settings?.cursorHideSeconds ?? 3,
      transitionEffect: settings?.transitionEffect ?? 'fade',
      transitionDuration: settings?.transitionDuration ?? 0.6,
    },
    location: {
      lat: (settings?.latitude ?? settings?.weather.latitude)?.toString() ?? '',
      lon: (settings?.longitude ?? settings?.weather.longitude)?.toString() ?? '',
      locationName: settings?.locationName ?? null,
      timezone: settings?.timezone ?? '',
    },
    weather: {
      provider: settings?.weather.provider ?? 'weatherapi',
      units: settings?.weather.units ?? 'imperial',
    },
    calendar: {
      selectedCalendarIds:
        settings?.calendar.googleCalendarIds ??
        (settings?.calendar.googleCalendarId ? [settings.calendar.googleCalendarId] : []),
      icalSources: settings?.calendar.icalSources ?? [],
      maxEvents: settings?.calendar.maxEvents ?? 10,
      daysAhead: settings?.calendar.daysAhead ?? 7,
      holidayCountry: settings?.calendar.holidayCountry ?? '',
    },
    sleep: {
      sleepEnabled: settings?.sleep?.enabled ?? false,
      dimAfterMinutes: settings?.sleep?.dimAfterMinutes ?? 10,
      sleepAfterMinutes: settings?.sleep?.sleepAfterMinutes ?? 0,
      dimBrightness: settings?.sleep?.dimBrightness ?? 20,
      dimScheduleEnabled: !!settings?.sleep?.dimSchedule,
      dimStartTime: settings?.sleep?.dimSchedule?.startTime ?? '23:00',
      dimEndTime: settings?.sleep?.dimSchedule?.endTime ?? '06:00',
      sleepScheduleEnabled: !!settings?.sleep?.schedule,
      sleepStartTime: settings?.sleep?.schedule?.startTime ?? '23:00',
      sleepEndTime: settings?.sleep?.schedule?.endTime ?? '06:00',
      screensaverMode: settings?.screensaver?.mode ?? 'clock',
    },
    alerts: {
      alertsEnabled: settings?.alerts?.enabled ?? true,
      alertsPosition: settings?.alerts?.position ?? 'top',
      alertsMaxVisible: settings?.alerts?.maxVisible ?? 3,
      alertsDefaultDuration: (settings?.alerts?.defaultDuration ?? 0) / 1000,
      alertsScale: settings?.alerts?.scale ?? 1,
    },
  };
}

/* ─── Page ────────────────────────────────────────── */

function getInitialTab(): TabId {
  if (typeof window === 'undefined') return 'display';
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') as TabId;
  return TABS.some((t) => t.id === tab) ? tab : 'display';
}

export default function SettingsPage() {
  const router = useRouter();
  const initialTab = getInitialTab();

  const { config, updateSettings, saveConfig, loadConfig, scaleAllModules } = useEditorStore();
  const settings = config?.settings;

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [state, setState] = useState<SettingsState>(() => initSettings(settings));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load config on mount (handles hard refresh / direct URL visit)
  useEffect(() => {
    if (!config) loadConfig();
  }, [config, loadConfig]);

  // Re-initialize local state once config arrives (initial load only).
  // Imports re-sync via DataSection's onSettingsImported callback.
  // Profile actions that mutate config.settings (e.g. setActiveProfile) must NOT wipe unsaved form edits.
  const settingsInitRef = useRef(false);
  useEffect(() => {
    if (settings && !settingsInitRef.current) {
      settingsInitRef.current = true;
      setState(initSettings(settings));
    }
  }, [settings]);

  // Upgrade/rollback modal state
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  const updateGroup = useCallback(<K extends keyof SettingsState>(group: K, updates: Partial<SettingsState[K]>) => {
    setState((prev) => ({ ...prev, [group]: { ...prev[group], ...updates } }));
    setSaveMessage(null);
  }, []);

  // Orientation change modal state
  const [orientationModal, setOrientationModal] = useState<{
    offCanvasCount: number;
    totalCount: number;
    oldWidth: number;
    oldHeight: number;
    newWidth: number;
    newHeight: number;
    pendingUpdates: Partial<DisplayState>;
  } | null>(null);

  const handleDisplayChange = useCallback((updates: Partial<DisplayState>) => {
    const newW = updates.displayWidth ?? state.display.displayWidth;
    const newH = updates.displayHeight ?? state.display.displayHeight;
    const shrunk = newW < state.display.displayWidth || newH < state.display.displayHeight;

    if (!shrunk || !config) {
      updateGroup('display', updates);
      return;
    }

    const offCanvas = countOffCanvasModules(config.screens, newW, newH);

    if (offCanvas === 0) {
      updateGroup('display', updates);
      return;
    }

    setOrientationModal({
      offCanvasCount: offCanvas,
      totalCount: totalModuleCount(config.screens),
      // Use saved config dimensions — modules are laid out against those, not unsaved form state
      oldWidth: config.settings.displayWidth,
      oldHeight: config.settings.displayHeight,
      newWidth: newW,
      newHeight: newH,
      pendingUpdates: updates,
    });
  }, [state.display.displayWidth, state.display.displayHeight, config, updateGroup]);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    // Update URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.toString());
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const { display, location, weather, calendar, sleep, alerts } = state;
      const parsedLat = parseFloat(location.lat) || 0;
      const parsedLon = parseFloat(location.lon) || 0;
      updateSettings({
        rotationIntervalMs: display.rotationInterval * 1000,
        displayWidth: display.displayWidth,
        displayHeight: display.displayHeight,
        displayTransform: display.displayTransform as 'normal' | '90' | '180' | '270',
        latitude: parsedLat,
        longitude: parsedLon,
        locationName: location.locationName ?? undefined,
        timezone: location.timezone || undefined,
        weather: {
          provider: weather.provider as 'openweathermap' | 'weatherapi',
          latitude: parsedLat,
          longitude: parsedLon,
          units: weather.units as 'metric' | 'imperial',
        },
        calendar: {
          googleCalendarId: calendar.selectedCalendarIds[0] ?? '',
          googleCalendarIds: calendar.selectedCalendarIds,
          icalSources: calendar.icalSources,
          maxEvents: calendar.maxEvents,
          daysAhead: calendar.daysAhead,
          ...(calendar.holidayCountry ? { holidayCountry: calendar.holidayCountry } : {}),
        },
        sleep: {
          enabled: sleep.sleepEnabled,
          dimAfterMinutes: sleep.dimAfterMinutes,
          sleepAfterMinutes: sleep.sleepAfterMinutes,
          dimBrightness: sleep.dimBrightness,
          ...(sleep.dimScheduleEnabled ? { dimSchedule: { startTime: sleep.dimStartTime, endTime: sleep.dimEndTime } } : {}),
          ...(sleep.sleepScheduleEnabled ? { schedule: { startTime: sleep.sleepStartTime, endTime: sleep.sleepEndTime } } : {}),
        },
        screensaver: {
          mode: sleep.screensaverMode as 'clock' | 'blank' | 'off',
        },
        cursorHideSeconds: display.cursorHideSeconds,
        transitionEffect: display.transitionEffect as GlobalSettings['transitionEffect'],
        transitionDuration: display.transitionDuration,
        alerts: {
          enabled: alerts.alertsEnabled,
          position: alerts.alertsPosition as 'top' | 'bottom',
          maxVisible: alerts.alertsMaxVisible,
          defaultDuration: alerts.alertsDefaultDuration * 1000,
          scale: alerts.alertsScale,
        },
      });
      await saveConfig();
      setSaveMessage('Saved');
      setTimeout(() => setSaveMessage(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  function handleUpgradeComplete() {
    setUpgradeTarget(null);
    setRollbackTarget(null);
    setTimeout(() => window.location.reload(), 2000);
  }

  function handleBack() {
    // Reload config in case it was modified by system restore
    loadConfig();
    router.push('/editor');
  }

  const activeTarget = upgradeTarget || rollbackTarget;

  if (activeTarget) {
    return (
      <UpgradeModal
        targetTag={activeTarget}
        isRollback={!!rollbackTarget}
        onComplete={handleUpgradeComplete}
        onClose={() => { setUpgradeTarget(null); setRollbackTarget(null); }}
      />
    );
  }

  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  const SELF_SAVING_TABS = new Set<TabId>(['system', 'data', 'integrations', 'security', 'profiles', 'stats', 'docs']);
  const showSaveButton = !SELF_SAVING_TABS.has(activeTab);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 bg-neutral-900 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Editor
          </button>
          <div className="h-6 w-px bg-neutral-800" />
          <button onClick={handleBack}>
            <HomeScreensLogo contextLabel="Settings" />
          </button>
        </div>
        {showSaveButton && (
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span className="text-xs text-green-400">{saveMessage}</span>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-neutral-700 bg-neutral-900/50 py-3 overflow-y-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-neutral-100 border-r-2 border-blue-500'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6">
            {activeTab === 'display' && (
              <DisplaySection
                values={state.display}
                onChange={handleDisplayChange}
              />
            )}

            {activeTab === 'profiles' && (
              <ProfilesSection />
            )}

            {activeTab === 'sleep' && (
              <SleepSection
                values={state.sleep}
                onChange={(updates) => updateGroup('sleep', updates)}
              />
            )}

            {activeTab === 'alerts' && (
              <AlertSection
                values={state.alerts}
                onChange={(updates) => updateGroup('alerts', updates)}
              />
            )}

            {activeTab === 'location' && (
              <LocationSection
                values={state.location}
                onChange={(updates) => updateGroup('location', updates)}
              />
            )}

            {activeTab === 'weather' && (
              <WeatherSection
                values={{
                  ...state.weather,
                  lat: state.location.lat,
                  lon: state.location.lon,
                }}
                onChange={(updates) => {
                  const { lat, lon, ...weatherUpdates } = updates as Partial<WeatherState & { lat: string; lon: string }>;
                  if (lat !== undefined || lon !== undefined) {
                    updateGroup('location', { ...(lat !== undefined && { lat }), ...(lon !== undefined && { lon }) });
                  }
                  if (Object.keys(weatherUpdates).length > 0) {
                    updateGroup('weather', weatherUpdates);
                  }
                }}
              />
            )}

            {activeTab === 'calendar' && (
              <CalendarSection
                values={{
                  ...state.calendar,
                  holidayCountry: state.calendar.holidayCountry || undefined,
                }}
                onChange={(updates) => updateGroup('calendar', updates)}
              />
            )}

            {activeTab === 'integrations' && (
              <IntegrationsSection />
            )}

            {activeTab === 'security' && (
              <SecuritySection />
            )}

            {activeTab === 'data' && (
              <DataSection
                onSettingsImported={() => {
                  const imported = useEditorStore.getState().config?.settings;
                  setState(initSettings(imported));
                }}
              />
            )}

            {activeTab === 'stats' && (
              <StatsSection />
            )}

            {activeTab === 'system' && (
              <SystemSection
                onUpgrade={(tag) => setUpgradeTarget(tag)}
                onRollback={(tag) => setRollbackTarget(tag)}
              />
            )}

            {activeTab === 'docs' && (
              <DocsSection />
            )}
          </div>
        </div>
      </div>

      {orientationModal && (
        <OrientationChangeModal
          offCanvasCount={orientationModal.offCanvasCount}
          totalModuleCount={orientationModal.totalCount}
          newWidth={orientationModal.newWidth}
          newHeight={orientationModal.newHeight}
          onCancel={() => setOrientationModal(null)}
          onSwitchAnyway={() => {
            updateGroup('display', orientationModal.pendingUpdates);
            setOrientationModal(null);
          }}
          onScaleToFit={() => {
            updateGroup('display', orientationModal.pendingUpdates);
            scaleAllModules(
              orientationModal.oldWidth,
              orientationModal.oldHeight,
              orientationModal.newWidth,
              orientationModal.newHeight,
            );
            setOrientationModal(null);
          }}
        />
      )}
    </div>
  );
}
