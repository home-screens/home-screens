'use client';

import type { DisplayStatus } from '@/lib/display-commands';
import ScreenControls from './ScreenControls';
import ProfileSwitcher from './ProfileSwitcher';
import AlertSender from './AlertSender';
import SystemInfo from './SystemInfo';
import PowerControls from './PowerControls';

interface ControlTabProps {
  status: DisplayStatus | null;
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | null;
  onNav: (direction: 'next' | 'prev') => void;
  onSleepWake: (asleep: boolean) => void;
}

export default function ControlTab({ status, profiles, activeProfile, onNav, onSleepWake }: ControlTabProps) {
  return (
    <div className="space-y-6">
      <ScreenControls
        status={status}
        onNav={onNav}
        onSleepWake={onSleepWake}
      />

      {profiles.length > 0 && (
        <ProfileSwitcher
          profiles={profiles}
          activeProfile={activeProfile}
        />
      )}

      <AlertSender />

      <SystemInfo />

      <PowerControls />
    </div>
  );
}
