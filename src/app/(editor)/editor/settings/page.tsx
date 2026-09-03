'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import SettingsSidebar from '@/components/editor/settings/SettingsSidebar';
import SettingsHeader from '@/components/editor/settings/SettingsHeader';
import DefaultsPageContent from '@/components/editor/settings/DefaultsPageContent';
import PerDisplayPage from '@/components/editor/settings/display/PerDisplayPage';
import { settingsHref, type DefaultPageId } from '@/lib/settings-route';
import { getLocation } from '@/lib/location';
import DisplaysIndexPage from '@/components/editor/settings/DisplaysIndexPage';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import UpgradeModal from '@/components/editor/UpgradeModal';
import { useSettingsAutosave } from '@/hooks/useSettingsAutosave';
import { useSettingsRoute } from '@/components/editor/settings/useSettingsRoute';
import { useSettingsHighlight } from '@/components/editor/settings/useSettingsHighlight';
import { useSavedFieldFlash } from '@/components/editor/settings/useSavedFieldFlash';
import { useOrientationGuard } from '@/components/editor/settings/useOrientationGuard';
import { useUpgradeModal } from '@/components/editor/settings/useUpgradeModal';

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

const LOCATION_LANDING_SEEN_KEY = 'hs-settings-location-landing-seen';

/**
 * `'location'` exactly once per browser while the location is unset, else
 * `'screen'`. Decided synchronously the render the config first arrives (so
 * no Screen page paints before the rewrite) and held for the rest of the
 * mount, so entering coordinates on the page does not flip the landing
 * choice under the user's feet.
 *
 * Only reads here. The once-per-browser flag is written by
 * `markLocationLandingSeen` when the landing actually applied: a deep link
 * into Settings (`?page=phone` from the checklist) must not spend it.
 */
function useLocationLanding(locationUnset: boolean): DefaultPageId {
  const decided = useRef<DefaultPageId | null>(null);
  if (decided.current === null && locationUnset && typeof window !== 'undefined') {
    let seen = true;
    try {
      seen = localStorage.getItem(LOCATION_LANDING_SEEN_KEY) === '1';
    } catch { /* private mode: treat as seen */ }
    decided.current = seen ? 'screen' : 'location';
  }
  return decided.current ?? 'screen';
}

function markLocationLandingSeen(): void {
  try {
    localStorage.setItem(LOCATION_LANDING_SEEN_KEY, '1');
  } catch { /* private mode */ }
}

function SettingsPageContent() {
  const router = useRouter();
  const tCore = useTranslate('core');

  const { config, updateSettings, saveConfig, loadConfig } = useEditorStore();
  // Subscribe to the store's save state so the header indicator lights
  // up for BOTH the local auto-save effect (Defaults pages) and the
  // per-display subtab mutations (which call saveConfig directly via
  // updateDisplay / updateDisplaySettings). Without this subscription
  // the indicator would only flash for edits that flowed through
  // `state` below, and per-display overrides would save silently.
  const storeIsSaving = useEditorStore((s) => s.isSaving);
  const storeSaveError = useEditorStore((s) => s.saveError);
  const settings = config?.settings;

  // The URL is the single source of truth for content routing — the hook
  // resolves it and canonicalizes the query string. A bare `/editor/settings`
  // lands on Location the first time this browser opens Settings while the
  // household location is unset: it is the first thing weather, sunrise,
  // moon phase and the rest need, and nothing else in the app links to it.
  // Once only — a household with no location-dependent modules is shown
  // the page once and then lands on Screen like everyone else. Until the
  // config has loaded the page renders its loading state, so the landing
  // choice is made before anything paints.
  const landingPage = useLocationLanding(settings != null && getLocation(settings) == null);
  const { route, panel, landingApplied } = useSettingsRoute(landingPage);
  useEffect(() => {
    if (landingApplied && landingPage === 'location') markLocationLandingSeen();
  }, [landingApplied, landingPage]);
  useSettingsHighlight();

  // Load config on mount (handles hard refresh / direct URL visit)
  useEffect(() => {
    if (!config) loadConfig();
  }, [config, loadConfig]);

  // Local form state + debounced auto-save state machine for Defaults
  // pages. Extracted into a hook so the timing semantics (one-time
  // hydration, dirty tracking, 500ms debounce, coalesced "Saved" toast)
  // stay in one place. `storeIsSaving`/`storeSaveError` are passed in so
  // the toast also fires for per-display subtab direct saves.
  const { state, setState, updateGroup, saving, saveMessage, savedFieldIds } = useSettingsAutosave({
    settings,
    updateSettings,
    saveConfig,
    storeIsSaving,
    storeSaveError,
  });

  useSavedFieldFlash(savedFieldIds);

  const upgrade = useUpgradeModal();
  const orientation = useOrientationGuard({ displayValues: state.display, updateGroup });

  // Entry-point used by the sidebar's "+" Add display button. Routes the
  // user to the displays index page where the existing DisplaysSection's
  // add form is the canonical add flow. Uses
  // `router.push` so `useSearchParams` re-renders the page with the
  // new route and the back button returns the user to the previous
  // section.
  const handleAddDisplayFromSidebar = useCallback(() => {
    router.push(settingsHref({ kind: 'displays' }));
  }, [router]);

  function handleBack() {
    // Reload config in case it was modified by system restore — but never
    // over edits that haven't reached the hub yet (a save that is failing or
    // still queued), which a reload would silently throw away.
    const { isDirty, isSaving } = useEditorStore.getState();
    if (!isDirty && !isSaving) loadConfig();
    router.push('/editor');
  }

  if (upgrade.activeTarget) {
    return (
      <UpgradeModal
        targetTag={upgrade.activeTarget}
        isRollback={upgrade.isRollback}
        currentVersion={upgrade.fromVersion}
        onComplete={upgrade.onComplete}
        onClose={upgrade.onClose}
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

  return (
    <div className="h-screen flex flex-col">
      <SettingsHeader
        onBack={handleBack}
        saving={saving}
        saveMessage={saveMessage}
        storeIsSaving={storeIsSaving}
        storeSaveError={storeSaveError}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — splits into Defaults / Per display in multi-display
            mode and collapses to a flat list in legacy single-display
            mode. URL-driven highlight, no parent state. */}
        <SettingsSidebar onAddDisplay={handleAddDisplayFromSidebar} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {route.kind === 'display' ? (
            <div className="mx-auto px-6 py-6 max-w-3xl">
              {/* `key` forces a fresh mount on display switch so the
                  subtabs' local form state (e.g. `widthDraft` in
                  DisplaySubtab, `name` in IdentitySubtab) rehydrates
                  from the new display's values. Without the key, React
                  reuses the existing instance and `useState` initializers
                  do not re-run — the user would see stale values for
                  the previously-viewed display. */}
              <PerDisplayPage
                key={route.displayId}
                displayId={route.displayId}
                subtab={route.subtab}
              />
            </div>
          ) : route.kind === 'displays' ? (
            <div className="mx-auto px-6 py-6 max-w-4xl">
              <DisplaysIndexPage />
            </div>
          ) : (
            <DefaultsPageContent
              page={route.page}
              panel={panel}
              config={config}
              state={state}
              setState={setState}
              updateGroup={updateGroup}
              onDisplayChange={orientation.onDisplayChange}
              onUpgrade={upgrade.onUpgrade}
              onRollback={upgrade.onRollback}
            />
          )}
        </div>
      </div>

      {orientation.prompt && (
        <OrientationChangeModal
          offCanvasCount={orientation.prompt.offCanvasCount}
          totalModuleCount={orientation.prompt.totalCount}
          newWidth={orientation.prompt.newWidth}
          newHeight={orientation.prompt.newHeight}
          onCancel={orientation.dismiss}
          onSwitchAnyway={orientation.switchAnyway}
          onScaleToFit={orientation.scaleToFit}
        />
      )}
    </div>
  );
}
