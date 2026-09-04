'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { DisplayStatus } from '@/lib/display-commands';
import type { ChoreChartConfig } from '@/types/config';
import type { ChoreData } from '@/lib/chore-data';
import { useTranslate } from '@/i18n';
import { useRemoteStatus, useAllDisplayStatuses, usePendingCommand } from './hooks';
import {
  DisplayTargetContext,
  withDisplayTarget,
  type DisplayLiveEntry,
  type DisplayTargetValue,
} from './display-target';
import { CONFIRM_TIMEOUT_MS, isOfflineSince } from '@/lib/display-liveness';
import { showToast } from './remote-toast';
import StatusBar from './components/StatusBar';
import ConnectionBanner from './components/ConnectionBanner';
import DisplayHero from './components/DisplayHero';
import ScreenNav from './components/ScreenControls';
import QuickActions from './components/QuickActions';
import BrightnessCard from './components/BrightnessCard';
import ProfileSwitcher from './components/ProfileSwitcher';
import DisplayPicker from './components/DisplayPicker';
import AlertSender from './components/AlertSender';
import SettingsSheet, { type PowerAction } from './components/SettingsSheet';
import BackupReminderBanner from './components/BackupReminderBanner';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import UpdateAvailableBanner from './components/UpdateAvailableBanner';
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import BottomTabBar from './components/BottomTabBar';
import RemoteToast from './components/RemoteToast';
import ChoresTab from './components/ChoresTab';
import TimersTab from './components/TimersTab';
import MealsTab from './components/MealsTab';
import PhotosTab from './components/PhotosTab';
import TabNotSetUp from './components/TabNotSetUp';

interface RemoteInitialData {
  screens: Array<{ id: string; name: string }>;
  /** Per-display screen lists, keyed by display id. Authoritative in multi-display mode. */
  displayScreens: Record<string, Array<{ id: string; name: string }>>;
  /** Global profile pool — used for the All target and legacy single-display installs. */
  profiles: Array<{ id: string; name: string }>;
  /** Global active profile — used for the All target and legacy single-display installs. */
  activeProfile: string | undefined;
  choreConfig: ChoreChartConfig | null;
  /** Household members and chores from `data/chores.json`, not module config. */
  choreData: ChoreData;
  hasMeals: boolean;
  hasPhotos: boolean;
  photoDirectory: string;
  backupReminder: { enabled: boolean; intervalDays: number };
  updateNotification: { enabled: boolean };
  updateChannel: 'stable' | 'dev';
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

/** How long the reconnecting banner may stand after a hub restart / reboot before giving up. */
const RECONNECT_WINDOW_MS: Record<PowerAction, number> = {
  'restart-service': 60_000,
  reboot: 150_000,
};

export default function RemoteClient({ initialData }: { initialData: RemoteInitialData }) {
  const t = useTranslate('remote');
  // Display targeting: 'all' broadcasts, a specific id targets one display,
  // and undefined falls back to legacy behaviour (no ?display= param at all).
  // Initialise to 'all' when displays exist so users see immediate feedback,
  // and to undefined for single-display installs so the URLs stay bare.
  const hasMultipleDisplays = initialData.displays.length > 0;
  const [displayTarget, setDisplayTarget] = useState<DisplayTargetValue>(
    hasMultipleDisplays ? 'all' : undefined,
  );
  const allMode = displayTarget === 'all';
  // Timers-tab "Show on" selection (empty = All). Held here, not in
  // TimersTab, because switching tabs unmounts TimersTab — a deliberate
  // selection must survive a detour through Chores and back.
  const [timerTargetIds, setTimerTargetIds] = useState<string[]>([]);

  // Status poll picks up the per-display heartbeat when targeting a specific
  // display. Under "All" it follows the first registered display so hub
  // reachability (and the fast nudge) keep working; the per-display picture
  // for All mode comes from `useAllDisplayStatuses` below.
  const statusPollTarget = allMode ? initialData.displays[0]?.id : displayTarget;
  const { status, isConnected, lastUpdated, neverConnected, lastPollFailed, nudge } = useRemoteStatus(5_000, statusPollTarget);
  const { entries: allEntries, nudge: nudgeAll } = useAllDisplayStatuses(hasMultipleDisplays);
  const nudgeAllPolls = useCallback(() => {
    nudge();
    nudgeAll();
  }, [nudge, nudgeAll]);

  const backup = useBackupReminder({
    enabled: initialData.backupReminder.enabled,
    intervalDays: initialData.backupReminder.intervalDays,
  });
  const updateNotif = useUpdateNotification({
    enabled: initialData.updateNotification.enabled,
    channel: initialData.updateChannel,
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

  // One live entry per display the remote knows about (see DisplayLiveEntry).
  // The targeted display's entry comes from the faster per-display poll so a
  // nudge lands there first; the rest ride the registry poll.
  const live: DisplayLiveEntry[] = useMemo(() => {
    if (!hasMultipleDisplays) {
      return [{
        id: undefined,
        name: t('displayHero.theDisplay'),
        status,
        lastSeen: status?.lastSeen ?? null,
        neverConnected,
        offline: isOfflineSince(status?.lastSeen),
      }];
    }
    return initialData.displays.map((d) => {
      if (d.id === statusPollTarget) {
        return {
          id: d.id,
          name: d.name,
          status,
          lastSeen: status?.lastSeen ?? null,
          neverConnected,
          offline: isOfflineSince(status?.lastSeen),
        };
      }
      const entry = allEntries?.find((e) => e.id === d.id);
      return {
        id: d.id,
        name: d.name,
        status: entry?.status ?? null,
        lastSeen: entry?.lastSeen ?? null,
        neverConnected: allEntries !== null && (!entry || entry.lastSeen === null),
        offline: isOfflineSince(entry?.lastSeen),
      };
    });
  }, [hasMultipleDisplays, initialData.displays, statusPollTarget, status, neverConnected, allEntries, t]);
  const liveRef = useRef(live);
  liveRef.current = live;

  const targetCtx = useMemo(
    () => ({
      target: displayTarget,
      setTarget: setDisplayTarget,
      displays: initialData.displays,
      timerTargetIds,
      setTimerTargetIds,
      live,
    }),
    [displayTarget, initialData.displays, timerTargetIds, live],
  );

  // The displays a command goes to, and the subset that can actually hear it.
  const targetEntries = useMemo(
    () => (allMode ? live : live.filter((e) => e.id === displayTarget)),
    [allMode, live, displayTarget],
  );
  const onlineTargets = useMemo(
    () => targetEntries.filter((e) => e.status !== null && !e.neverConnected && !e.offline),
    [targetEntries],
  );
  const controlsDisabled = onlineTargets.length === 0;
  const targetName = allMode ? null : (targetEntries[0]?.name ?? t('displayHero.theDisplay'));

  // "Kitchen didn't respond" — names the online targets that never confirmed.
  const noConfirmToast = useCallback(() => {
    const current = liveRef.current;
    const targets = allMode ? current : current.filter((e) => e.id === displayTarget);
    const names = targets.filter((e) => e.status !== null && !e.offline).map((e) => e.name);
    showToast(
      t('feedback.noConfirm', { name: names.length > 0 ? names.join(', ') : t('displayHero.theDisplay') }),
      'error',
    );
  }, [allMode, displayTarget, t]);

  // ---- Sleep / wake: optimistic, confirmed by heartbeat, reverted on silence
  const actualAsleep = onlineTargets.length > 0 && onlineTargets.every((e) => e.status!.displayState === 'asleep');
  const sleepPending = usePendingCommand<'active' | 'asleep'>(CONFIRM_TIMEOUT_MS, noConfirmToast);
  useEffect(() => {
    if (sleepPending.expected === null) return;
    if (onlineTargets.length > 0 && onlineTargets.every((e) => e.status!.displayState === sleepPending.expected)) {
      sleepPending.settle();
    }
  }, [onlineTargets, sleepPending]);
  const isAsleep = sleepPending.expected !== null ? sleepPending.expected === 'asleep' : actualAsleep;

  const handleSleepWake = useCallback(() => {
    const next = isAsleep ? 'active' : 'asleep';
    sleepPending.start(next);
    nudgeAllPolls();
    const url = withDisplayTarget(`/api/display/${next === 'active' ? 'wake' : 'sleep'}`, displayTarget);
    editorFetch(url).catch(() => {});
  }, [isAsleep, sleepPending, nudgeAllPolls, displayTarget]);

  // ---- Screen navigation (single display only): same confirm-or-revert
  const navPending = usePendingCommand<number>(CONFIRM_TIMEOUT_MS, noConfirmToast);
  useEffect(() => {
    if (navPending.expected === null || !status) return;
    if (status.currentScreen.index === navPending.expected) navPending.settle();
  }, [status, navPending]);

  // Screens of the display whose status we are showing. The rotation index in
  // a heartbeat is relative to that display's own screen list, so resolving a
  // name from any other list (the legacy global pool, or a flat union across
  // displays) yields the wrong screen name.
  const targetScreens =
    (statusPollTarget ? initialData.displayScreens[statusPollTarget] : undefined) ??
    initialData.screens;

  // Merge the pending overrides into the status the cards render
  const effectiveStatus: DisplayStatus | null = status
    ? {
        ...status,
        displayState: sleepPending.expected ?? status.displayState,
        currentScreen:
          navPending.expected !== null
            ? {
                ...status.currentScreen,
                index: navPending.expected,
                name: targetScreens[navPending.expected]?.name ?? status.currentScreen.name,
              }
            : status.currentScreen,
      }
    : null;

  const handleNav = useCallback((direction: 'next' | 'prev') => {
    if (!status) return;
    const count = status.screenCount;
    const cur = navPending.expected ?? status.currentScreen.index;
    const next = direction === 'next' ? (cur + 1) % count : (cur - 1 + count) % count;
    navPending.start(next);
    nudgeAllPolls();
    const url = withDisplayTarget(
      `/api/display/${direction === 'next' ? 'next-screen' : 'prev-screen'}`,
      displayTarget,
    );
    editorFetch(url).catch(() => {});
  }, [status, navPending, nudgeAllPolls, displayTarget]);

  // ---- Brightness and alerts read the same online-target picture
  const reportedBrightness = useMemo(
    () => onlineTargets.flatMap((e) => (typeof e.status?.brightness === 'number' ? [e.status.brightness] : [])),
    [onlineTargets],
  );
  const activeAlerts = useMemo(() => {
    const known = onlineTargets.flatMap((e) => (typeof e.status?.activeAlerts === 'number' ? [e.status.activeAlerts] : []));
    return known.length > 0 ? known.reduce((sum, n) => sum + n, 0) : null;
  }, [onlineTargets]);

  // ---- Hub restart / reboot: expected silence, then "back"
  const [reconnecting, setReconnecting] = useState<PowerAction | null>(null);
  const sawOutageRef = useRef(false);
  const handlePowerAction = useCallback((action: PowerAction) => {
    sawOutageRef.current = false;
    setReconnecting(action);
    setSettingsOpen(false);
    nudge();
  }, [nudge]);
  useEffect(() => {
    if (!reconnecting) return;
    if (lastPollFailed) {
      sawOutageRef.current = true;
    } else if (sawOutageRef.current) {
      setReconnecting(null);
      showToast(t('feedback.hubBack'));
    }
  }, [lastPollFailed, reconnecting, t]);
  useEffect(() => {
    if (!reconnecting) return;
    const timer = setTimeout(() => setReconnecting(null), RECONNECT_WINDOW_MS[reconnecting]);
    return () => clearTimeout(timer);
  }, [reconnecting]);

  // The screen picker only makes sense for a single display, since each
  // display can have a different screen set. Hide profile/screen-aware
  // controls when broadcasting.
  const showSingleDisplayControls = !allMode;

  // When a specific display is targeted, show that display's resolved
  // profile pool (which may be owned or allowlist-restricted). The global
  // pool is only correct for the All/legacy case.
  const targetProfileData =
    displayTarget && !allMode
      ? initialData.displayProfiles[displayTarget]
      : undefined;
  const effectiveProfiles = targetProfileData?.profiles ?? initialData.profiles;
  const effectiveInitialActiveProfile =
    targetProfileData?.activeProfile ?? initialData.activeProfile ?? null;

  return (
    <DisplayTargetContext.Provider value={targetCtx}>
      <div className="min-h-dvh bg-hs-body text-hs-text-body">
        {/* Phone-first layout, but the remote is opened on tablets and laptops
            too; without a cap the cards stretch to a 1400px ribbon. The tab bar
            stays outside so it still spans the window. */}
        <div className="mx-auto w-full max-w-[640px]">
          {reconnecting ? (
            <ConnectionBanner mode={reconnecting} />
          ) : !isConnected ? (
            <ConnectionBanner mode="unreachable" />
          ) : null}

          {activeTab === 'control' ? (
            <>
              <StatusBar isConnected={isConnected} onSettingsOpen={() => setSettingsOpen(true)} />
              <UpdateAvailableBanner
                shouldShow={updateNotif.shouldShow}
                latestVersion={updateNotif.latestVersion}
                onDismiss={updateNotif.handleDismiss}
              />
              <BackupReminderBanner
                shouldShow={backup.shouldShow}
                daysSinceBackup={backup.daysSinceBackup}
                busy={backup.busy}
                onBackup={backup.handleBackup}
                onDismiss={backup.handleDismiss}
              />
              <DisplayPicker />
              <DisplayHero
                status={effectiveStatus}
                isConnected={isConnected}
                lastUpdated={lastUpdated}
                neverConnected={neverConnected}
                displayName={hasMultipleDisplays && !allMode ? targetName ?? undefined : undefined}
                allEntries={allMode ? live : null}
              />
              {showSingleDisplayControls && (
                <ScreenNav status={effectiveStatus} onNav={handleNav} disabled={controlsDisabled} />
              )}
              <QuickActions
                isAsleep={isAsleep}
                sleepPending={sleepPending.expected !== null}
                disabled={controlsDisabled}
                targetName={targetName}
                onSleepWake={handleSleepWake}
                onAlertOpen={() => setAlertOpen(true)}
              />
              <BrightnessCard
                reportedValues={reportedBrightness}
                disabled={controlsDisabled}
                onSent={nudgeAllPolls}
                onNoConfirm={noConfirmToast}
              />
              {showSingleDisplayControls && effectiveProfiles.length > 0 && (
                <ProfileSwitcher
                  profiles={effectiveProfiles}
                  activeProfile={status?.activeProfile ?? effectiveInitialActiveProfile}
                  displayName={targetName ?? t('displayHero.theDisplay')}
                />
              )}

              {/* Bottom spacer for fixed tab bar */}
              <div className="h-20" />

              <AlertSender
                open={alertOpen}
                onClose={() => setAlertOpen(false)}
                targetName={targetName}
                activeAlerts={activeAlerts}
                onSent={nudgeAllPolls}
              />
              <SettingsSheet
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                onBackup={backup.handleBackup}
                backupBusy={backup.busy}
                onPowerAction={handlePowerAction}
              />
            </>
          ) : activeTab === 'timers' ? (
            <TimersTab />
          ) : activeTab === 'chores' ? (
            <>
              <div className="px-4 pb-8 pt-4">
                {hasChores
                  ? <ChoresTab config={initialData.choreConfig!} choreData={initialData.choreData} isAdmin />
                  : <TabNotSetUp kind="chores" />}
              </div>
              <div className="h-20" />
            </>
          ) : activeTab === 'meals' ? (
            <>
              <div className="px-4 pb-8 pt-4">
                {hasMeals ? <MealsTab /> : <TabNotSetUp kind="meals" />}
              </div>
              <div className="h-20" />
            </>
          ) : activeTab === 'photos' ? (
            <>
              <div className="px-4 pb-8 pt-4">
                {hasPhotos
                  ? <PhotosTab directory={initialData.photoDirectory} />
                  : <TabNotSetUp kind="photos" />}
              </div>
              <div className="h-20" />
            </>
          ) : null}
        </div>

        <RemoteToast />
        <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
      </div>
    </DisplayTargetContext.Provider>
  );
}
