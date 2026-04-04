'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DisplayStatus } from '@/lib/display-commands';
import type { ChoreChartConfig } from '@/types/config';
import { useRemoteStatus } from './hooks';
import StatusBar from './components/StatusBar';
import ConnectionBanner from './components/ConnectionBanner';
import DisplayHero from './components/DisplayHero';
import ScreenNav from './components/ScreenControls';
import QuickActions from './components/QuickActions';
import BrightnessCard from './components/BrightnessCard';
import ProfileSwitcher from './components/ProfileSwitcher';
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
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | undefined;
  choreConfig: ChoreChartConfig | null;
  hasMeals: boolean;
  hasPhotos: boolean;
  photoDirectory: string;
  backupReminder: { enabled: boolean; intervalDays: number };
}

export default function RemoteClient({ initialData }: { initialData: RemoteInitialData }) {
  const { status, isConnected, lastUpdated, nudge } = useRemoteStatus();
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
    fetch(`/api/display/${direction === 'next' ? 'next-screen' : 'prev-screen'}`).catch(() => {});
  }, [nudge, status, optimistic.screenIndex]);

  const handleSleepWake = useCallback(() => {
    nudge();
    const isAsleep = (optimistic.displayState ?? status?.displayState) === 'asleep';
    setOptimistic((prev) => ({ ...prev, displayState: isAsleep ? 'active' : 'asleep' }));
    fetch(`/api/display/${isAsleep ? 'wake' : 'sleep'}`).catch(() => {});
  }, [nudge, status, optimistic.displayState]);

  const isAsleep = (optimistic.displayState ?? effectiveStatus?.displayState) === 'asleep';

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-neutral-200">
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
          <DisplayHero status={effectiveStatus} isConnected={isConnected} lastUpdated={lastUpdated} />
          <ScreenNav status={effectiveStatus} onNav={handleNav} />
          <QuickActions isAsleep={isAsleep} onSleepWake={handleSleepWake} onAlertOpen={() => setAlertOpen(true)} />
          <BrightnessCard />
          {initialData.profiles.length > 0 && (
            <ProfileSwitcher
              profiles={initialData.profiles}
              activeProfile={status?.activeProfile ?? initialData.activeProfile ?? null}
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
  );
}
