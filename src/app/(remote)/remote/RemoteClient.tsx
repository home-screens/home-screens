'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { DisplayStatus } from '@/lib/display-commands';
import type { ChoreChartConfig } from '@/types/config';
import { useRemoteStatus } from './hooks';
import { DisplayTargetContext, withDisplayTarget, type DisplayTargetValue } from './display-target';
import StatusBar from './components/StatusBar';
import ConnectionBanner from './components/ConnectionBanner';
import DisplayHero from './components/DisplayHero';
import ScreenNav from './components/ScreenControls';
import QuickActions from './components/QuickActions';
import BrightnessCard from './components/BrightnessCard';
import ProfileSwitcher from './components/ProfileSwitcher';
import DisplayPicker from './components/DisplayPicker';
import AlertSender from './components/AlertSender';
import SettingsSheet from './components/SettingsSheet';
import BackupReminderBanner from './components/BackupReminderBanner';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import BottomTabBar from './components/BottomTabBar';
import ChoresTab from './components/ChoresTab';
import MealsTab from './components/MealsTab';
import PhotosTab from './components/PhotosTab';

interface RemoteInitialData {
  screens: Array<{ id: string; name: string }>;
  /** Global profile pool — used for the All target and legacy single-display installs. */
  profiles: Array<{ id: string; name: string }>;
  /** Global active profile — used for the All target and legacy single-display installs. */
  activeProfile: string | undefined;
  choreConfig: ChoreChartConfig | null;
  hasMeals: boolean;
  hasPhotos: boolean;
  photoDirectory: string;
  backupReminder: { enabled: boolean; intervalDays: number };
  /** Multi-display registry. Empty in single-display installs. */
  displays: Array<{ id: string; name: string }>;
  /**
   * Per-display resolved profile pool + active profile, keyed by displayId.
   * Needed because a display can own its own `profiles` — the global list is
   * the wrong one to show when a specific display with owned profiles is
   * selected.
   */
  displayProfiles: Record<
    string,
    { profiles: Array<{ id: string; name: string }>; activeProfile?: string }
  >;
}

export default function RemoteClient({ initialData }: { initialData: RemoteInitialData }) {
  // Display targeting: 'all' broadcasts, a specific id targets one display,
  // and undefined falls back to legacy behaviour (no ?display= param at all).
  // Initialise to 'all' when displays exist so users see immediate feedback,
  // and to undefined for single-display installs so the URLs stay bare.
  const hasMultipleDisplays = initialData.displays.length > 0;
  const [displayTarget, setDisplayTarget] = useState<DisplayTargetValue>(
    hasMultipleDisplays ? 'all' : undefined,
  );

  const targetCtx = useMemo(
    () => ({
      target: displayTarget,
      setTarget: setDisplayTarget,
      displays: initialData.displays,
    }),
    [displayTarget, initialData.displays],
  );

  // Status poll picks up the per-display heartbeat when targeting a specific
  // display. Status reports are stored per-display ID, so when the user picks
  // "All" we read the first registered display's status as a representative
  // sample — the alternative (reading the legacy `__default__` slot) returns
  // null in multi-display mode and blanks out the hero panel.
  const statusPollTarget =
    displayTarget === 'all' ? initialData.displays[0]?.id : displayTarget;
  const { status, isConnected, lastUpdated, nudge } = useRemoteStatus(5_000, statusPollTarget);
  const backup = useBackupReminder({
    enabled: initialData.backupReminder.enabled,
    intervalDays: initialData.backupReminder.intervalDays,
  });

  const [activeTab, setActiveTab] = useState<string>('control');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const hasChores = initialData.choreConfig !== null;
  const hasMeals = initialData.hasMeals;
  const hasPhotos = initialData.hasPhotos;

  // Close sheets when switching tabs
  useEffect(() => {
    setSettingsOpen(false);
    setAlertOpen(false);
  }, [activeTab]);

  // Optimistic overrides for instant feedback
  const [optimistic, setOptimistic] = useState<{
    displayState?: 'active' | 'asleep';
    screenIndex?: number;
  }>({});

  // Clear optimistic overrides once real status catches up
  useEffect(() => {
    if (!status) return;
    setOptimistic((prev) => {
      const next = { ...prev };
      if (prev.displayState && status.displayState === prev.displayState) delete next.displayState;
      if (prev.screenIndex !== undefined && status.currentScreen.index === prev.screenIndex) delete next.screenIndex;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [status]);

  // Merge optimistic overrides into effective status
  const effectiveStatus: DisplayStatus | null = status
    ? {
        ...status,
        displayState: optimistic.displayState ?? status.displayState,
        currentScreen:
          optimistic.screenIndex !== undefined
            ? {
                ...status.currentScreen,
                index: optimistic.screenIndex,
                name: initialData.screens[optimistic.screenIndex]?.name ?? status.currentScreen.name,
              }
            : status.currentScreen,
      }
    : null;

  const handleNav = useCallback((direction: 'next' | 'prev') => {
    nudge();
    if (!status) return;
    const count = status.screenCount;
    const cur = optimistic.screenIndex ?? status.currentScreen.index;
    const next = direction === 'next' ? (cur + 1) % count : (cur - 1 + count) % count;
    setOptimistic((prev) => ({ ...prev, screenIndex: next }));
    const url = withDisplayTarget(
      `/api/display/${direction === 'next' ? 'next-screen' : 'prev-screen'}`,
      displayTarget,
    );
    editorFetch(url).catch(() => {});
  }, [nudge, status, optimistic.screenIndex, displayTarget]);

  const handleSleepWake = useCallback(() => {
    nudge();
    const isAsleep = (optimistic.displayState ?? status?.displayState) === 'asleep';
    setOptimistic((prev) => ({ ...prev, displayState: isAsleep ? 'active' : 'asleep' }));
    const url = withDisplayTarget(
      `/api/display/${isAsleep ? 'wake' : 'sleep'}`,
      displayTarget,
    );
    editorFetch(url).catch(() => {});
  }, [nudge, status, optimistic.displayState, displayTarget]);

  const isAsleep = (optimistic.displayState ?? effectiveStatus?.displayState) === 'asleep';

  // The screen picker only makes sense for a single display, since each
  // display can have a different screen set. Hide profile/screen-aware
  // controls when broadcasting.
  const showSingleDisplayControls = displayTarget !== 'all';

  // When a specific display is targeted, show that display's resolved
  // profile pool (which may be owned or allowlist-restricted). The global
  // pool is only correct for the All/legacy case.
  const targetProfileData =
    displayTarget && displayTarget !== 'all'
      ? initialData.displayProfiles[displayTarget]
      : undefined;
  const effectiveProfiles = targetProfileData?.profiles ?? initialData.profiles;
  const effectiveInitialActiveProfile =
    targetProfileData?.activeProfile ?? initialData.activeProfile ?? null;

  return (
    <DisplayTargetContext.Provider value={targetCtx}>
      <div className="min-h-dvh bg-hs-body text-hs-text-body">
        {!isConnected && <ConnectionBanner />}

        {activeTab === 'control' ? (
          <>
            <StatusBar isConnected={isConnected} onSettingsOpen={() => setSettingsOpen(true)} />
            <BackupReminderBanner
              shouldShow={backup.shouldShow}
              daysSinceBackup={backup.daysSinceBackup}
              busy={backup.busy}
              onBackup={backup.handleBackup}
              onDismiss={backup.handleDismiss}
            />
            <DisplayPicker />
            <DisplayHero status={effectiveStatus} isConnected={isConnected} lastUpdated={lastUpdated} />
            {showSingleDisplayControls && <ScreenNav status={effectiveStatus} onNav={handleNav} />}
            <QuickActions isAsleep={isAsleep} onSleepWake={handleSleepWake} onAlertOpen={() => setAlertOpen(true)} />
            <BrightnessCard />
            {showSingleDisplayControls && effectiveProfiles.length > 0 && (
              <ProfileSwitcher
                profiles={effectiveProfiles}
                activeProfile={status?.activeProfile ?? effectiveInitialActiveProfile}
              />
            )}

            {/* Bottom spacer for fixed tab bar */}
            {(hasChores || hasMeals || hasPhotos) && <div className="h-20" />}

            <AlertSender open={alertOpen} onClose={() => setAlertOpen(false)} />
            <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onBackup={backup.handleBackup} backupBusy={backup.busy} />
          </>
        ) : activeTab === 'chores' ? (
          <>
            <div className="px-4 pb-8 pt-4">
              <ChoresTab config={initialData.choreConfig!} isAdmin />
            </div>
            <div className="h-20" />
          </>
        ) : activeTab === 'meals' ? (
          <>
            <div className="px-4 pb-8 pt-4">
              <MealsTab />
            </div>
            <div className="h-20" />
          </>
        ) : activeTab === 'photos' ? (
          <>
            <div className="px-4 pb-8 pt-4">
              <PhotosTab directory={initialData.photoDirectory} />
            </div>
            <div className="h-20" />
          </>
        ) : null}

        {(hasChores || hasMeals || hasPhotos) && (
          <BottomTabBar activeTab={activeTab} onChange={setActiveTab} hasChores={hasChores} hasMeals={hasMeals} hasPhotos={hasPhotos} />
        )}
      </div>
    </DisplayTargetContext.Provider>
  );
}
