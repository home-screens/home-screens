'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import type { GlobalSettings, DisplayNodeSettings } from '@/types/config';
import { diffDisplayOverrides } from '@/lib/display-override-diff';
import DisplayContextHeader from '@/components/editor/settings/DisplayContextHeader';
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
  UtensilsCrossed,
  Tv,
} from 'lucide-react';

import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import Button from '@/components/ui/Button';
import DisplaySection from '@/components/editor/settings/DisplaySection';
import DisplaysSection from '@/components/editor/settings/DisplaysSection';
import SleepSection from '@/components/editor/settings/SleepSection';
import LocationSection from '@/components/editor/settings/LocationSection';
import WeatherSection from '@/components/editor/settings/WeatherSection';
import IntegrationsSection from '@/components/editor/settings/IntegrationsSection';
import CalendarSection from '@/components/editor/settings/CalendarSection';
import MealsSection from '@/components/editor/settings/MealsSection';
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
  { id: 'displays', label: 'Displays', icon: Tv },
  { id: 'profiles', label: 'Profiles', icon: Layers },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'weather', label: 'Weather', icon: CloudSun },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'meals', label: 'Meals', icon: UtensilsCrossed },
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
  fullscreenTheme: string;
  pauseEnabled: boolean;
  pauseTimeoutSeconds: number;
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

/* ─── Form ↔ Config transforms ───────────────────
 * toFormState and toConfigSettings are intentional mirrors.
 * When adding a new setting, update both (and FORM_DEFAULTS).
 */

const FORM_DEFAULTS: SettingsState = {
  display: {
    rotationInterval: 30,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    cursorHideSeconds: 3,
    transitionEffect: 'fade',
    transitionDuration: 0.6,
    fullscreenTheme: 'linen',
    pauseEnabled: true,
    pauseTimeoutSeconds: 300,
  },
  location: { lat: '', lon: '', locationName: null, timezone: '' },
  weather: { provider: 'weatherapi', units: 'imperial' },
  calendar: { selectedCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7, holidayCountry: '' },
  sleep: {
    sleepEnabled: false,
    dimAfterMinutes: 10,
    sleepAfterMinutes: 0,
    dimBrightness: 20,
    dimScheduleEnabled: false,
    dimStartTime: '23:00',
    dimEndTime: '06:00',
    sleepScheduleEnabled: false,
    sleepStartTime: '23:00',
    sleepEndTime: '06:00',
    screensaverMode: 'clock',
  },
  alerts: { alertsEnabled: true, alertsPosition: 'top', alertsMaxVisible: 3, alertsDefaultDuration: 0, alertsScale: 1 },
};

function toFormState(s: GlobalSettings | undefined): SettingsState {
  if (!s) return FORM_DEFAULTS;
  return {
    display: {
      rotationInterval: s.rotationIntervalMs / 1000,
      displayWidth: s.displayWidth,
      displayHeight: s.displayHeight,
      displayTransform: s.displayTransform ?? FORM_DEFAULTS.display.displayTransform,
      cursorHideSeconds: s.cursorHideSeconds ?? FORM_DEFAULTS.display.cursorHideSeconds,
      transitionEffect: s.transitionEffect ?? FORM_DEFAULTS.display.transitionEffect,
      transitionDuration: s.transitionDuration ?? FORM_DEFAULTS.display.transitionDuration,
      fullscreenTheme: s.fullscreenTheme ?? FORM_DEFAULTS.display.fullscreenTheme,
      pauseEnabled: s.pauseEnabled ?? FORM_DEFAULTS.display.pauseEnabled,
      pauseTimeoutSeconds: s.pauseTimeoutSeconds ?? FORM_DEFAULTS.display.pauseTimeoutSeconds,
    },
    location: {
      lat: (s.latitude ?? s.weather.latitude)?.toString() ?? '',
      lon: (s.longitude ?? s.weather.longitude)?.toString() ?? '',
      locationName: s.locationName ?? null,
      timezone: s.timezone ?? '',
    },
    weather: {
      provider: s.weather.provider,
      units: s.weather.units,
    },
    calendar: {
      selectedCalendarIds: s.calendar.googleCalendarIds ?? (s.calendar.googleCalendarId ? [s.calendar.googleCalendarId] : []),
      icalSources: s.calendar.icalSources ?? [],
      maxEvents: s.calendar.maxEvents ?? FORM_DEFAULTS.calendar.maxEvents,
      daysAhead: s.calendar.daysAhead ?? FORM_DEFAULTS.calendar.daysAhead,
      holidayCountry: s.calendar.holidayCountry ?? '',
    },
    sleep: {
      sleepEnabled: s.sleep?.enabled ?? false,
      dimAfterMinutes: s.sleep?.dimAfterMinutes ?? FORM_DEFAULTS.sleep.dimAfterMinutes,
      sleepAfterMinutes: s.sleep?.sleepAfterMinutes ?? FORM_DEFAULTS.sleep.sleepAfterMinutes,
      dimBrightness: s.sleep?.dimBrightness ?? FORM_DEFAULTS.sleep.dimBrightness,
      dimScheduleEnabled: !!s.sleep?.dimSchedule,
      dimStartTime: s.sleep?.dimSchedule?.startTime ?? FORM_DEFAULTS.sleep.dimStartTime,
      dimEndTime: s.sleep?.dimSchedule?.endTime ?? FORM_DEFAULTS.sleep.dimEndTime,
      sleepScheduleEnabled: !!s.sleep?.schedule,
      sleepStartTime: s.sleep?.schedule?.startTime ?? FORM_DEFAULTS.sleep.sleepStartTime,
      sleepEndTime: s.sleep?.schedule?.endTime ?? FORM_DEFAULTS.sleep.sleepEndTime,
      screensaverMode: s.screensaver?.mode ?? FORM_DEFAULTS.sleep.screensaverMode,
    },
    alerts: {
      alertsEnabled: s.alerts?.enabled ?? FORM_DEFAULTS.alerts.alertsEnabled,
      alertsPosition: s.alerts?.position ?? FORM_DEFAULTS.alerts.alertsPosition,
      alertsMaxVisible: s.alerts?.maxVisible ?? FORM_DEFAULTS.alerts.alertsMaxVisible,
      alertsDefaultDuration: (s.alerts?.defaultDuration ?? 0) / 1000,
      alertsScale: s.alerts?.scale ?? FORM_DEFAULTS.alerts.alertsScale,
    },
  };
}

/**
 * Convert the flat SleepState form shape back to the nested
 * { sleep, screensaver } config shape. Extracted so both the global Save
 * path and the per-display fork path can compute the same value.
 */
function sleepFormToConfig(sleep: SleepState): {
  sleep: NonNullable<GlobalSettings['sleep']>;
  screensaver: NonNullable<GlobalSettings['screensaver']>;
} {
  return {
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
  };
}

function sleepConfigToForm(
  sleep: GlobalSettings['sleep'] | undefined,
  screensaver: GlobalSettings['screensaver'] | undefined,
): SleepState {
  return {
    sleepEnabled: sleep?.enabled ?? FORM_DEFAULTS.sleep.sleepEnabled,
    dimAfterMinutes: sleep?.dimAfterMinutes ?? FORM_DEFAULTS.sleep.dimAfterMinutes,
    sleepAfterMinutes: sleep?.sleepAfterMinutes ?? FORM_DEFAULTS.sleep.sleepAfterMinutes,
    dimBrightness: sleep?.dimBrightness ?? FORM_DEFAULTS.sleep.dimBrightness,
    dimScheduleEnabled: !!sleep?.dimSchedule,
    dimStartTime: sleep?.dimSchedule?.startTime ?? FORM_DEFAULTS.sleep.dimStartTime,
    dimEndTime: sleep?.dimSchedule?.endTime ?? FORM_DEFAULTS.sleep.dimEndTime,
    sleepScheduleEnabled: !!sleep?.schedule,
    sleepStartTime: sleep?.schedule?.startTime ?? FORM_DEFAULTS.sleep.sleepStartTime,
    sleepEndTime: sleep?.schedule?.endTime ?? FORM_DEFAULTS.sleep.sleepEndTime,
    screensaverMode: screensaver?.mode ?? FORM_DEFAULTS.sleep.screensaverMode,
  };
}

function alertsFormToConfig(alerts: AlertState): NonNullable<GlobalSettings['alerts']> {
  return {
    enabled: alerts.alertsEnabled,
    position: alerts.alertsPosition as 'top' | 'bottom',
    maxVisible: alerts.alertsMaxVisible,
    defaultDuration: alerts.alertsDefaultDuration * 1000,
    scale: alerts.alertsScale,
  };
}

function alertsConfigToForm(alerts: GlobalSettings['alerts'] | undefined): AlertState {
  return {
    alertsEnabled: alerts?.enabled ?? FORM_DEFAULTS.alerts.alertsEnabled,
    alertsPosition: alerts?.position ?? FORM_DEFAULTS.alerts.alertsPosition,
    alertsMaxVisible: alerts?.maxVisible ?? FORM_DEFAULTS.alerts.alertsMaxVisible,
    alertsDefaultDuration: (alerts?.defaultDuration ?? 0) / 1000,
    alertsScale: alerts?.scale ?? FORM_DEFAULTS.alerts.alertsScale,
  };
}

function toConfigSettings(state: SettingsState): Partial<GlobalSettings> {
  const { display, location, weather, calendar, sleep, alerts } = state;
  const parsedLat = parseFloat(location.lat) || 0;
  const parsedLon = parseFloat(location.lon) || 0;

  return {
    rotationIntervalMs: display.rotationInterval * 1000,
    displayWidth: display.displayWidth,
    displayHeight: display.displayHeight,
    displayTransform: display.displayTransform as 'normal' | '90' | '180' | '270',
    cursorHideSeconds: display.cursorHideSeconds,
    transitionEffect: display.transitionEffect as GlobalSettings['transitionEffect'],
    transitionDuration: display.transitionDuration,
    fullscreenTheme: display.fullscreenTheme,
    pauseEnabled: display.pauseEnabled,
    pauseTimeoutSeconds: display.pauseTimeoutSeconds,
    latitude: parsedLat,
    longitude: parsedLon,
    locationName: location.locationName ?? undefined,
    timezone: location.timezone || undefined,
    weather: {
      provider: weather.provider as GlobalSettings['weather']['provider'],
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
    alerts: {
      enabled: alerts.alertsEnabled,
      position: alerts.alertsPosition as 'top' | 'bottom',
      maxVisible: alerts.alertsMaxVisible,
      defaultDuration: alerts.alertsDefaultDuration * 1000,
      scale: alerts.alertsScale,
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

  const { config, selectedDisplayId, updateSettings, updateDisplaySettings, saveConfig, loadConfig, scaleAllModules } = useEditorStore();
  const settings = config?.settings;
  const displays = config?.displays;
  const isMultiDisplay = !!displays && displays.length > 0;
  const activeDisplay = isMultiDisplay && selectedDisplayId
    ? displays.find((d) => d.id === selectedDisplayId) ?? null
    : null;

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [state, setState] = useState<SettingsState>(() => toFormState(settings));
  // Per-display override form state. Tracks ONLY the fields the user has
  // explicitly forked for the currently-selected display. A missing key
  // means "inherit from global"; a present key is the override value. On
  // Save we diff this against the saved display.settings to compute both
  // additions/updates and explicit resets (undefined ⇒ delete key).
  const [displayOverrideState, setDisplayOverrideState] = useState<DisplayNodeSettings>(
    () => activeDisplay?.settings ?? {},
  );
  // Dirty flag for the per-display form. Set by `setDisplayOverride`;
  // cleared on display switch (via the reload effect) and after Save.
  // `handleSave` skips the `updateDisplaySettings` store call entirely
  // when this is false, so saves on globals-only edits don't re-write
  // every forked key (and can't clobber concurrent per-display writes).
  const displayOverrideDirtyRef = useRef(false);
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
      setState(toFormState(settings));
    }
  }, [settings]);

  // When the selected display changes, reload the per-display override
  // form from THAT display's saved settings. Unsaved edits on the previous
  // display are dropped — matching the toolbar's DisplaySwitcher UX.
  //
  // IMPORTANT: we intentionally key this effect on `selectedDisplayId` only
  // (not on a stringified snapshot of `activeDisplay.settings`). If the
  // effect fired on every store mutation, a successful Save would
  // re-trigger it mid-save and clobber in-flight form edits. The downside
  // is that external writes to `display.settings` (e.g. a different
  // editor tab saving) won't refresh the form — but the user can reload
  // to pick them up, and the alternative (post-save clobber) was worse.
  const prevDisplayIdRef = useRef<string | null>(selectedDisplayId);
  useEffect(() => {
    if (prevDisplayIdRef.current !== selectedDisplayId) {
      prevDisplayIdRef.current = selectedDisplayId;
      setDisplayOverrideState(activeDisplay?.settings ?? {});
      displayOverrideDirtyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDisplayId]);

  // Upgrade/rollback modal state
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  const updateGroup = useCallback(<K extends keyof SettingsState>(group: K, updates: Partial<SettingsState[K]>) => {
    setState((prev) => ({ ...prev, [group]: { ...prev[group], ...updates } }));
    setSaveMessage(null);
  }, []);

  // Set (or clear) a per-display override on the form. Passing `undefined`
  // for `value` means "reset this field to inherited" — we delete the key
  // from the form state so the Save-time diff turns it into an explicit
  // `undefined` for updateDisplaySettings, which in turn removes the key
  // from display.settings on disk.
  const setDisplayOverride = useCallback(<K extends keyof DisplayNodeSettings>(key: K, value: DisplayNodeSettings[K] | undefined) => {
    setDisplayOverrideState((prev) => {
      if (value === undefined) {
        if (!(key in prev)) return prev;
        const { [key]: _drop, ...rest } = prev;
        void _drop;
        return rest as DisplayNodeSettings;
      }
      return { ...prev, [key]: value };
    });
    displayOverrideDirtyRef.current = true;
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

    // In multi-display mode, the Display tab's dimension fields edit the
    // GLOBAL settings, but module layout lives inside the currently-active
    // display's own `screens`. Count off-canvas modules and source the
    // "oldWidth/oldHeight" for scaleAllModules from that same active view
    // so the confirm modal and the actual scale op stay consistent.
    const activeScreens = getActiveScreens(config, selectedDisplayId);
    const activeDims = getActiveDimensions(config, selectedDisplayId);
    const offCanvas = countOffCanvasModules(activeScreens, newW, newH);

    if (offCanvas === 0) {
      updateGroup('display', updates);
      return;
    }

    setOrientationModal({
      offCanvasCount: offCanvas,
      totalCount: totalModuleCount(activeScreens),
      // Use saved active-display dimensions — modules are laid out against
      // those, not unsaved form state or the global fallback.
      oldWidth: activeDims.width,
      oldHeight: activeDims.height,
      newWidth: newW,
      newHeight: newH,
      pendingUpdates: updates,
    });
  }, [state.display.displayWidth, state.display.displayHeight, config, selectedDisplayId, updateGroup]);

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
      updateSettings(toConfigSettings(state));

      // In multi-display mode, also flush the per-display override form
      // to the active display — but ONLY if the user actually touched
      // any per-display field since the last load. Without this guard,
      // every Save would re-write every forked key, potentially
      // clobbering concurrent writes from other editor tabs or from the
      // /api/display/profile endpoint.
      //
      // When the form IS dirty, we diff against the saved display.settings
      // so keys that the user "Reset to inherited" are sent as `undefined`
      // (which `updateDisplaySettings` converts into a delete-key) rather
      // than silently sticking around.
      if (selectedDisplayId && activeDisplay && displayOverrideDirtyRef.current) {
        const diff = diffDisplayOverrides(
          activeDisplay.settings ?? {},
          displayOverrideState,
        );
        if (Object.keys(diff).length > 0) {
          updateDisplaySettings(selectedDisplayId, diff);
        }
      }

      await saveConfig();
      displayOverrideDirtyRef.current = false;
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

  const SELF_SAVING_TABS = new Set<TabId>(['system', 'data', 'integrations', 'security', 'profiles', 'displays', 'stats', 'docs', 'meals']);
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
          <div className={`mx-auto px-6 py-6 ${activeTab === 'integrations' ? 'max-w-4xl' : 'max-w-2xl'}`}>
            {activeTab === 'display' && (
              <>
                <DisplayContextHeader />
                <DisplaySection
                  values={state.display}
                  onChange={handleDisplayChange}
                  perDisplay={isMultiDisplay ? {
                    overrides: displayOverrideState,
                    onFork: setDisplayOverride,
                    onReset: (key) => setDisplayOverride(key, undefined),
                  } : undefined}
                  /* Dimensions for non-main displays live on the DisplayNode
                     itself and are edited via the Displays tab. Hide the
                     Orientation/Resolution/Flip controls here so the form
                     can't silently write to the global settings. Main's
                     dimensions still live on globals, so main keeps the
                     controls. */
                  dimensionsLocked={isMultiDisplay && selectedDisplayId !== null && selectedDisplayId !== 'main'}
                  dimensionsLockedDisplayName={activeDisplay?.name}
                />
              </>
            )}

            {activeTab === 'displays' && (
              <DisplaysSection />
            )}

            {activeTab === 'profiles' && (
              <>
                <DisplayContextHeader />
                <ProfilesSection />
              </>
            )}

            {activeTab === 'sleep' && (() => {
              // Sleep + screensaver are treated as one forked unit (plan:
              // nested-object overrides are full-replacement). When either
              // side of the override is set, the tab edits the override;
              // otherwise it edits the global sleep form.
              const isForked = !!(displayOverrideState.sleep || displayOverrideState.screensaver);
              const sleepValues = isForked
                ? sleepConfigToForm(displayOverrideState.sleep, displayOverrideState.screensaver)
                : state.sleep;
              const handleChange = (updates: Partial<SleepState>) => {
                if (isForked) {
                  // Re-derive the nested shape from the merged form state and
                  // write back into the override, so every keystroke keeps
                  // the override in sync with the form.
                  const merged = { ...sleepValues, ...updates };
                  const { sleep, screensaver } = sleepFormToConfig(merged);
                  setDisplayOverride('sleep', sleep);
                  setDisplayOverride('screensaver', screensaver);
                } else {
                  updateGroup('sleep', updates);
                }
              };
              return (
                <>
                  <DisplayContextHeader />
                  <SleepSection
                    values={sleepValues}
                    onChange={handleChange}
                    fork={isMultiDisplay && selectedDisplayId ? {
                      isForked,
                      displayName: activeDisplay?.name ?? selectedDisplayId,
                      onFork: () => {
                        // Seed both override fields from the current global
                        // form state so the user sees no behavior change
                        // until they edit a specific sub-control.
                        const { sleep, screensaver } = sleepFormToConfig(state.sleep);
                        setDisplayOverride('sleep', sleep);
                        setDisplayOverride('screensaver', screensaver);
                      },
                      onReset: () => {
                        setDisplayOverride('sleep', undefined);
                        setDisplayOverride('screensaver', undefined);
                      },
                    } : undefined}
                  />
                </>
              );
            })()}

            {activeTab === 'alerts' && (() => {
              const isForked = displayOverrideState.alerts !== undefined;
              const alertValues = isForked
                ? alertsConfigToForm(displayOverrideState.alerts)
                : state.alerts;
              const handleChange = (updates: Partial<AlertState>) => {
                if (isForked) {
                  const merged = { ...alertValues, ...updates };
                  setDisplayOverride('alerts', alertsFormToConfig(merged));
                } else {
                  updateGroup('alerts', updates);
                }
              };
              return (
                <>
                  <DisplayContextHeader />
                  <AlertSection
                    values={alertValues}
                    onChange={handleChange}
                    displayId={isMultiDisplay ? selectedDisplayId : null}
                    fork={isMultiDisplay && selectedDisplayId ? {
                      isForked,
                      displayName: activeDisplay?.name ?? selectedDisplayId,
                      onFork: () => {
                        setDisplayOverride('alerts', alertsFormToConfig(state.alerts));
                      },
                      onReset: () => {
                        setDisplayOverride('alerts', undefined);
                      },
                    } : undefined}
                  />
                </>
              );
            })()}

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

            {activeTab === 'meals' && (
              <MealsSection />
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
                  setState(toFormState(imported));
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
