'use client';

import { Suspense, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslate } from '@/i18n';
import { useEditorStore, getActiveScreens, getActiveDimensions } from '@/stores/editor-store';
import SettingsSidebar from '@/components/editor/settings/SettingsSidebar';
import { ArrowLeft, Sun, Moon, Monitor } from 'lucide-react';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '@/lib/theme';

import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import ScreenSection from '@/components/editor/settings/ScreenSection';
import PerDisplayPage from '@/components/editor/settings/display/PerDisplayPage';
import { resolveSettingsRoute, settingsHref, type DefaultPageId } from '@/lib/settings-route';
import DisplaysIndexPage from '@/components/editor/settings/DisplaysIndexPage';
import LocationSection from '@/components/editor/settings/LocationSection';
import LanguageFields from '@/components/editor/settings/LanguageFields';
import WeatherSection from '@/components/editor/settings/WeatherSection';
import IntegrationsSection from '@/components/editor/settings/IntegrationsSection';
import CalendarSection from '@/components/editor/settings/CalendarSection';
import MealsSection from '@/components/editor/settings/MealsSection';
import AutomationSection from '@/components/editor/settings/AutomationSection';
import SystemSection from '@/components/editor/settings/SystemSection';
import NetworkSection from '@/components/editor/settings/NetworkSection';
import SecuritySection from '@/components/editor/settings/SecuritySection';
import StatsSection from '@/components/editor/settings/StatsSection';
import DataSection from '@/components/editor/settings/DataSection';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import UpgradeModal from '@/components/editor/UpgradeModal';
import { countOffCanvasModules, totalModuleCount } from '@/lib/module-utils';
import {
  toFormState,
  type DisplayState,
  type WeatherState,
} from '@/lib/settings-form';
import { useSettingsAutosave } from '@/hooks/useSettingsAutosave';

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
  | 'screen'
  | 'displays'
  | 'automation'
  | 'location'
  | 'weather'
  | 'calendar'
  | 'meals'
  | 'integrations'
  | 'security'
  | 'data'
  | 'stats'
  | 'system'
  | 'network';

/* ─── Page ────────────────────────────────────────── */

/**
 * The settings sidebar URL shape — `?section=defaults&page=X`,
 * `?section=display&id=X&subtab=Y`, `?section=displays` — is parsed by
 * the pure helpers in `lib/settings-route.ts`. The parser was hoisted
 * out so it can be unit-tested without a `window`. The page still
 * drives content branching off the `kind` field of the resolved route
 * below.
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
  // The parser lives in `lib/settings-route` so it can be unit-tested
  // without a `window`. The `redirectedQuery` field tells the effect
  // below whether the URL bar needs to be rewritten to the canonical
  // shape.
  const { route: sectionRoute, redirectedQuery } = useMemo(
    () => resolveSettingsRoute(searchParams?.toString() ?? ''),
    [searchParams],
  );

  // One-shot URL canonicalization. The pure helper above already
  // resolved the route, so the first render shows the right content.
  // This effect just flushes the canonical query string into the URL bar
  // when a stale param needs normalizing. No-op on every pass after
  // the first.
  //
  // Re-resolved from window.location at replace time rather than reusing
  // the memoized `redirectedQuery`: `syncEditorUrl` writes `display=` /
  // `screen=` via raw history.replaceState, which `useSearchParams` never
  // observes, so replacing with the stale snapshot could silently drop
  // params added after it was taken.
  useEffect(() => {
    if (!redirectedQuery) return;
    const { redirectedQuery: fresh } = resolveSettingsRoute(window.location.search);
    if (fresh) router.replace(`?${fresh}`);
  }, [redirectedQuery, router]);

  // `activeTab` is derived from sectionRoute when a Defaults page is
  // active. The content dispatch below keys off it — the
  // `DEFAULTS_PAGE_CONTENT` record plus a couple of width special cases
  // (`activeTab === 'stats'` / `'integrations'`).
  const activeTab: TabId | null = sectionRoute.kind === 'defaults' ? sectionRoute.page : null;
  // The route carries the intra-page tab, so the sections no longer parse
  // `?panel=` themselves and can't drift from what the URL resolved to.
  const activePanel = sectionRoute.kind === 'defaults' ? sectionRoute.panel : undefined;
  // Load config on mount (handles hard refresh / direct URL visit)
  useEffect(() => {
    if (!config) loadConfig();
  }, [config, loadConfig]);

  // Scroll to and briefly pulse the field named by `?highlight=` — the
  // destination of a field-level sidebar search result. Several Defaults
  // pages (System, Data, ...) fetch their own data and render a loading
  // placeholder before the real field markup mounts, so the target's
  // `data-field-id` element isn't necessarily in the DOM on the first
  // paint after `router.push` — this polls briefly rather than checking
  // once. Stripped back out of the URL once the pulse finishes so
  // revisiting the page later, or hitting back/forward, doesn't replay it.
  const highlightFieldId = searchParams?.get('highlight') ?? null;
  useEffect(() => {
    if (!highlightFieldId) return;
    let cancelled = false;
    let classTimer: ReturnType<typeof setTimeout> | null = null;
    let stripTimer: ReturnType<typeof setTimeout> | null = null;

    const selector = `[data-field-id="${CSS.escape(highlightFieldId)}"]`;
    const tryHighlight = () => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-settings-highlight');
      classTimer = setTimeout(() => el.classList.remove('animate-settings-highlight'), 1800);
      stripTimer = setTimeout(() => {
        // Rebuilt from window.location at fire time, not the searchParams
        // snapshot: `syncEditorUrl` writes `display=` / `screen=` via raw
        // history.replaceState during the pulse window, and replacing with
        // the stale snapshot would silently drop them.
        const params = new URLSearchParams(window.location.search);
        params.delete('highlight');
        router.replace(`?${params.toString()}`);
      }, 1800);
      return true;
    };

    let pollId: ReturnType<typeof setInterval> | null = null;
    if (!tryHighlight()) {
      const deadline = Date.now() + 3000;
      pollId = setInterval(() => {
        if (cancelled || tryHighlight() || Date.now() > deadline) {
          if (pollId) clearInterval(pollId);
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (classTimer) clearTimeout(classTimer);
      if (stripTimer) clearTimeout(stripTimer);
    };
  }, [highlightFieldId, searchParams, router]);

  // Local form state + debounced auto-save state machine for Defaults
  // pages. Extracted into a hook so the timing semantics (one-time
  // hydration, dirty tracking, 500ms debounce, coalesced "Saved" toast)
  // stay in one place. `storeIsSaving`/`storeSaveError` are passed in so
  // the toast also fires for per-display subtab direct saves.
  const { state, setState, updateGroup, saving, saveMessage } = useSettingsAutosave({
    settings,
    updateSettings,
    saveConfig,
    storeIsSaving,
    storeSaveError,
  });

  // Upgrade/rollback modal state
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [upgradeFromVersion, setUpgradeFromVersion] = useState<string | null>(null);

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
    router.push(settingsHref({ kind: 'displays' }));
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
        currentVersion={upgradeFromVersion}
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

  /**
   * Content for every Defaults page, keyed by page id.
   *
   * Typed as a total `Record<DefaultPageId, ReactNode>` on purpose: adding an
   * id to `DEFAULT_PAGE_IDS` without adding content here is now a build
   * failure rather than a page that renders an empty pane with no clue why.
   */
  const DEFAULTS_PAGE_CONTENT: Record<DefaultPageId, ReactNode> = {
    screen: config ? (
      <ScreenSection
        config={config}
        panel={activePanel}
        displayValues={state.display}
        sleepValues={state.sleep}
        alertValues={state.alerts}
        onDisplayChange={handleDisplayChange}
        onSleepChange={(updates) => updateGroup('sleep', updates)}
        onAlertsChange={(updates) => updateGroup('alerts', updates)}
      />
    ) : null,

    automation: <AutomationSection panel={activePanel} />,

    location: (
      <>
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-hs-text-faint mb-1">
            {t('settings.locationAndLanguagePage.breadcrumb')}
          </div>
          <h1 className="text-xl font-semibold text-hs-text-primary">
            {t('settings.locationAndLanguagePage.title')}
          </h1>
          <p className="text-sm text-hs-text-faint mt-1">
            {t('settings.locationAndLanguagePage.description')}
          </p>
        </div>
        <LanguageFields />
        <div className="mt-6">
          <LocationSection
            values={state.location}
            onChange={(updates) => updateGroup('location', updates)}
          />
        </div>
      </>
    ),

    weather: (
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
    ),

    calendar: (
      <CalendarSection
        values={{
          ...state.calendar,
          holidayCountry: state.calendar.holidayCountry || undefined,
        }}
        onChange={(updates) => updateGroup('calendar', updates)}
      />
    ),

    meals: <MealsSection />,

    integrations: <IntegrationsSection />,

    security: <SecuritySection />,

    data: (
      <DataSection
        onSettingsImported={() => {
          const imported = useEditorStore.getState().config?.settings;
          setState(toFormState(imported));
        }}
      />
    ),

    stats: <StatsSection />,

    system: (
      <SystemSection
        onUpgrade={(tag, from) => { setUpgradeFromVersion(from); setUpgradeTarget(tag); }}
        onRollback={(tag, from) => { setUpgradeFromVersion(from); setRollbackTarget(tag); }}
      />
    ),

    network: <NetworkSection />,
  };

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
            {/* Keyed off a Record<DefaultPageId, ReactNode> rather than a chain
                of `activeTab === 'x' &&` branches. A live page id with no
                content branch used to render a silently empty pane; now a
                missing entry is a compile error, which matters because this
                list churned twice during the settings reorg. */}
            {DEFAULTS_PAGE_CONTENT[activeTab as DefaultPageId] ?? null}
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
