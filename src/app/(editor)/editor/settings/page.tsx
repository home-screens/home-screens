'use client';

import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslate } from '@/i18n';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import SettingsSidebar from '@/components/editor/settings/SettingsSidebar';
import { ArrowLeft, Sun, Moon, Monitor } from 'lucide-react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme';

import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import DefaultDisplaySection from '@/components/editor/settings/DefaultDisplaySection';
import DefaultSleepSection from '@/components/editor/settings/DefaultSleepSection';
import DefaultAlertsSection from '@/components/editor/settings/DefaultAlertsSection';
import PerDisplayPage from '@/components/editor/settings/display/PerDisplayPage';
import { resolveSettingsRoute } from '@/lib/settings-route';
import DisplaysIndexPage from '@/components/editor/settings/DisplaysIndexPage';
import LocationSection from '@/components/editor/settings/LocationSection';
import LanguageAndRegionPage from '@/components/editor/settings/LanguageAndRegionPage';
import WeatherSection from '@/components/editor/settings/WeatherSection';
import IntegrationsSection from '@/components/editor/settings/IntegrationsSection';
import CalendarSection from '@/components/editor/settings/CalendarSection';
import MealsSection from '@/components/editor/settings/MealsSection';
import ProfilesSection from '@/components/editor/settings/ProfilesSection';
import SystemSection from '@/components/editor/settings/SystemSection';
import NetworkSection from '@/components/editor/settings/NetworkSection';
import SecuritySection from '@/components/editor/settings/SecuritySection';
import StatsSection from '@/components/editor/settings/StatsSection';
import DataSection from '@/components/editor/settings/DataSection';
import DocsSection from '@/components/editor/settings/DocsSection';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import UpgradeModal from '@/components/editor/UpgradeModal';
import { countOffCanvasModules, totalModuleCount } from '@/lib/module-utils';
import {
  toConfigSettings,
  toFormState,
  type DisplayState,
  type SettingsState,
  type WeatherState,
} from '@/lib/settings-form';

/* ─── Tab definitions ─────────────────────────────── */

/**
 * Canonical id union for the page-content router. The sidebar rendering
 * lives in `SettingsSidebar` (which has its own icon mapping) and the
 * URL parser lives in `lib/settings-route` (which has its own
 * `DEFAULT_PAGE_IDS` const), so the only thing `settings/page.tsx`
 * still needs from the legacy TABS array is the literal union — exposed
 * here directly to keep the file dependency-free of any lucide-react
 * icon imports it doesn't actually render.
 *
 * `displays` is kept in the union because it's a valid `section`
 * value (not a page), and the active-tab derivation needs to be aware
 * of it even though the content branches never render it as a
 * Defaults page.
 */
type TabId =
  | 'display'
  | 'displays'
  | 'profiles'
  | 'sleep'
  | 'alerts'
  | 'location'
  | 'language'
  | 'weather'
  | 'calendar'
  | 'meals'
  | 'integrations'
  | 'security'
  | 'data'
  | 'stats'
  | 'system'
  | 'network'
  | 'docs';

/* ─── Page ────────────────────────────────────────── */

/**
 * The settings sidebar URL shape — `?section=defaults&page=X`,
 * `?section=display&id=X&subtab=Y`, `?section=displays` — is parsed by
 * the pure helpers in `lib/settings-route.ts`. The parser was hoisted
 * out so the legacy `?tab=X` redirect can be unit-tested without a
 * `window`. The page still drives content branching off the `kind`
 * field of the resolved route below.
 */

export default function SettingsPage() {
  // `useSearchParams` forces the page to bail out of static prerender
  // unless it's wrapped in a Suspense boundary. The outer shell is
  // intentionally empty (or a cheap fallback) so Next can prerender a
  // static HTML skeleton and stream the real content at runtime.
  const tCore = useTranslate('core');
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-hs-text-faint">
          {tCore('loading')}
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}

type SaveStatus = 'saved' | 'failed' | null;

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  const { config, selectedDisplayId, updateSettings, saveConfig, loadConfig, scaleAllModules } = useEditorStore();
  // Subscribe to the store's save state so the header indicator lights
  // up for BOTH the local auto-save effect (Defaults pages) and the
  // per-display subtab mutations (which call saveConfig directly via
  // updateDisplay / updateDisplaySettings). Without this subscription
  // the indicator would only flash for edits that flowed through
  // `state` below, and per-display overrides would save silently.
  const storeIsSaving = useEditorStore((s) => s.isSaving);
  const storeSaveError = useEditorStore((s) => s.saveError);
  const settings = config?.settings;

  // The URL is the single source of truth for content routing.
  // `useSearchParams` re-renders this component whenever Next's router
  // updates — so browser back/forward, `router.push` from the sidebar,
  // and every `<Link>` click all stay in sync without a popstate listener.
  // The parser lives in `lib/settings-route` so the legacy `?tab=X`
  // redirect can be unit-tested without a `window`. The `redirectedQuery`
  // field tells the effect below whether the URL bar needs to be
  // rewritten to the canonical shape.
  const { route: sectionRoute, redirectedQuery } = useMemo(
    () => resolveSettingsRoute(searchParams?.toString() ?? ''),
    [searchParams],
  );

  // One-shot legacy URL canonicalization. The pure helper above already
  // resolved the route from the legacy `?tab=X`, so the first render
  // shows the right content. This effect just flushes the canonical
  // query string into the URL bar so subsequent navigations don't see
  // the legacy key. No-op on every pass after the first.
  useEffect(() => {
    if (!redirectedQuery) return;
    router.replace(`?${redirectedQuery}`);
  }, [redirectedQuery, router]);

  // `activeTab` is derived from sectionRoute when a Defaults page is
  // active. The legacy content branches below still key off it
  // (`activeTab === 'display'`, etc.) so the routing change stays
  // surgical — only the sidebar and the URL parser need to know about
  // the new shape.
  const activeTab: TabId | null = sectionRoute.kind === 'defaults' ? sectionRoute.page : null;
  const [state, setState] = useState<SettingsState>(() => toFormState(settings));
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<SaveStatus>(null);

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

  // Auto-save infrastructure.
  //
  // `userDirtyRef` flips to true the first time the user actually edits
  // a form field, so the initial `settingsInitRef` hydration (which calls
  // `setState(toFormState(settings))` once config loads) doesn't trigger
  // a pointless write-back of config-to-itself. Every path that mutates
  // `state` from user input funnels through `updateGroup` below, which
  // sets the flag — so adding a new form field Just Works without having
  // to remember to mark it dirty manually.
  //
  // `autoSaveTimerRef` holds the debounce timer. Every state change
  // cancels any pending timer and schedules a fresh save 500ms out, so
  // slider drags and per-keystroke number inputs collapse into a single
  // PUT instead of hammering the disk on every tick.
  //
  // `latestStateRef` captures the most recent `state` without forcing
  // the auto-save callback to re-capture on every render — the timer
  // fires once and reads the latest state at the moment it runs,
  // regardless of how many renders happened in between.
  const userDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  // Pulse a "Saved" toast whenever the store's isSaving flag transitions
  // from true back to false without an error. This catches per-display
  // subtab mutations (DisplaySubtab, SleepSubtab, AlertsSubtab, etc.)
  // which call `saveConfig()` directly — their saves would otherwise
  // complete silently with no header feedback. The local auto-save
  // effect for Defaults pages also flips store.isSaving, so this fires
  // for both paths via a single subscription.
  //
  // The save-coalescing retry previously lived here (watching the
  // `isDirty` flag and re-firing saveConfig() after a concurrent
  // subtab write) but it has moved into `saveConfig` itself — the
  // store's `_pendingResave` flag flushes any mutation that landed
  // while a save was in flight, so the race is handled at the source
  // instead of observed from here.
  const prevStoreIsSavingRef = useRef(storeIsSaving);
  useEffect(() => {
    const wasSaving = prevStoreIsSavingRef.current;
    prevStoreIsSavingRef.current = storeIsSaving;
    if (wasSaving && !storeIsSaving && !storeSaveError) {
      // Coalesced-save flicker guard: when a mutation lands during an
      // in-flight save, the store transitions isSaving true→false→true
      // (first save lands, queueMicrotask schedules the re-save). The
      // observer fires on the intermediate false, but a "Saved" toast at
      // that moment is misleading because the latest mutation is still
      // pending. Read the live store state imperatively (no subscription,
      // no extra re-renders) to detect the in-progress re-save: if
      // anything is still dirty or another save has already kicked off,
      // skip the toast and wait for the final transition.
      const live = useEditorStore.getState();
      if (live.isSaving || live.isDirty) return;
      setSaveMessage('saved');
      const timer = setTimeout(
        () => setSaveMessage((prev) => (prev === 'saved' ? null : prev)),
        2000,
      );
      return () => clearTimeout(timer);
    }
  }, [storeIsSaving, storeSaveError]);

  useEffect(() => {
    if (!settingsInitRef.current || !userDirtyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveMessage(null);
      try {
        updateSettings(toConfigSettings(latestStateRef.current));
        await saveConfig();
        setSaveMessage('saved');
        // Clear the "Saved" toast after a couple of seconds so it
        // disappears during long idle periods and reappears on the
        // next change.
        setTimeout(() => setSaveMessage((prev) => (prev === 'saved' ? null : prev)), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveMessage('failed');
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [state, updateSettings, saveConfig]);

  // Upgrade/rollback modal state
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  const updateGroup = useCallback(<K extends keyof SettingsState>(group: K, updates: Partial<SettingsState[K]>) => {
    // Mark the form as user-dirty so the auto-save effect knows the
    // next state change is a real edit, not hydration. Set before
    // setState so the effect's dependency update sees the flag already
    // true on the subsequent render.
    userDirtyRef.current = true;
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

  // Entry-point used by the sidebar's "+" Add display button. Routes the
  // user to the displays index page where the existing DisplaysSection's
  // add form is the canonical add flow. Uses
  // `router.push` so `useSearchParams` re-renders the page with the
  // new route and the back button returns the user to the previous
  // section.
  const handleAddDisplayFromSidebar = useCallback(() => {
    router.push('?section=displays');
  }, [router]);

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
      <div className="h-screen flex items-center justify-center text-hs-text-faint">
        {tCore('loading')}
      </div>
    );
  }

  // Header status indicator: visible whenever a save is in flight or
  // a recently-completed save is still being acknowledged. Replaces
  // the old per-tab Save button now that every settings surface
  // auto-saves. The indicator is presence-only in the steady state —
  // no visual clutter when the user isn't actively editing.
  //
  // The isSaving source-of-truth is the store, not the local `saving`
  // state. This way both the Defaults-page auto-save effect AND the
  // per-display subtab direct-save paths light up the same indicator.
  // Error state falls back to storeSaveError so per-display save
  // failures don't disappear just because local state said "Saved".
  const isActivelySaving = saving || storeIsSaving;
  const hasFailure = saveMessage === 'failed' || !!storeSaveError;
  const statusIndicator = isActivelySaving ? (
    <span className="text-xs text-hs-text-muted flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-warning animate-pulse" />
      {tCore('status.saving')}
    </span>
  ) : hasFailure ? (
    <span className="text-xs text-hs-danger flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-danger" />
      {t('common.saveFailed')}
    </span>
  ) : saveMessage === 'saved' ? (
    <span className="text-xs text-hs-success flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-hs-success" />
      {t('common.saved')}
    </span>
  ) : null;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hs-border-strong bg-hs-panel px-4 py-2.5">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-hs-text-muted hover:text-hs-text-body transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('settings.header.backToEditor')}
          </button>
          <div className="h-6 w-px bg-hs-card" />
          <button onClick={handleBack}>
            <HomeScreensLogo contextLabel={t('settings.header.contextLabel')} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {statusIndicator}
          <ThemeToggle />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — splits into Defaults / Per display in multi-display
            mode and collapses to a flat list in legacy single-display
            mode. URL-driven highlight, no parent state. */}
        <SettingsSidebar onAddDisplay={handleAddDisplayFromSidebar} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {sectionRoute?.kind === 'display' ? (
            <div className="mx-auto px-6 py-6 max-w-3xl">
              {/* `key` forces a fresh mount on display switch so the
                  subtabs' local form state (e.g. `widthDraft` in
                  DisplaySubtab, `name` in IdentitySubtab) rehydrates
                  from the new display's values. Without the key, React
                  reuses the existing instance and `useState` initializers
                  do not re-run — the user would see stale values for
                  the previously-viewed display. */}
              <PerDisplayPage
                key={sectionRoute.displayId}
                displayId={sectionRoute.displayId}
                subtab={sectionRoute.subtab}
              />
            </div>
          ) : sectionRoute.kind === 'displays' ? (
            <div className="mx-auto px-6 py-6 max-w-4xl">
              <DisplaysIndexPage />
            </div>
          ) : (
          <div className={`mx-auto px-6 py-6 ${
            activeTab === 'stats'
              ? 'max-w-6xl'
              : activeTab === 'integrations'
                ? 'max-w-4xl'
                : 'max-w-2xl'
          }`}>
            {activeTab === 'display' && config && (
              <DefaultDisplaySection
                config={config}
                values={state.display}
                onChange={handleDisplayChange}
              />
            )}

            {activeTab === 'profiles' && (
              <ProfilesSection />
            )}

            {activeTab === 'sleep' && config && (
              <DefaultSleepSection
                config={config}
                values={state.sleep}
                onChange={(updates) => updateGroup('sleep', updates)}
              />
            )}

            {activeTab === 'alerts' && config && (
              <DefaultAlertsSection
                config={config}
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

            {activeTab === 'language' && (
              <LanguageAndRegionPage />
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

            {activeTab === 'network' && (
              <NetworkSection />
            )}

            {activeTab === 'docs' && (
              <DocsSection />
            )}

          </div>
          )}
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

const THEME_CYCLE: ThemeChoice[] = ['dark', 'light', 'system'];
const THEME_ICON = { dark: Moon, light: Sun, system: Monitor } as const;

function ThemeToggle() {
  const t = useTranslate('editor');
  const [choice, setChoice] = useState<ThemeChoice>('dark');
  useEffect(() => { setChoice(getThemeChoice()); }, []);

  const cycle = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(choice) + 1) % THEME_CYCLE.length];
    setChoice(next);
    setThemeChoice(next);
  };

  const Icon = THEME_ICON[choice];
  const label = t(`settings.header.theme.${choice}`);

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-hs-text-muted hover:text-hs-text-body hover:bg-hs-hover transition-colors"
      title={t('settings.header.theme.titleFormat', { label })}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}
