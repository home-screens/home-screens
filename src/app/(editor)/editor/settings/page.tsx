'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import SettingsSidebar from '@/components/editor/settings/SettingsSidebar';
import SettingsHeader from '@/components/editor/settings/SettingsHeader';
import DefaultsPageContent from '@/components/editor/settings/DefaultsPageContent';
import PerDisplayPage from '@/components/editor/settings/display/PerDisplayPage';
import { settingsHref } from '@/lib/settings-route';
import DisplaysIndexPage from '@/components/editor/settings/DisplaysIndexPage';
import OrientationChangeModal from '@/components/editor/settings/OrientationChangeModal';
import UpgradeModal from '@/components/editor/UpgradeModal';
import { useSettingsAutosave } from '@/hooks/useSettingsAutosave';
import { useSettingsRoute } from '@/components/editor/settings/useSettingsRoute';
import { useSettingsHighlight } from '@/components/editor/settings/useSettingsHighlight';
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
  // resolves it and canonicalizes the query string.
  const { route, panel } = useSettingsRoute();
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
  const { state, setState, updateGroup, saving, saveMessage } = useSettingsAutosave({
    settings,
    updateSettings,
    saveConfig,
    storeIsSaving,
    storeSaveError,
  });

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
    // Reload config in case it was modified by system restore
    loadConfig();
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
