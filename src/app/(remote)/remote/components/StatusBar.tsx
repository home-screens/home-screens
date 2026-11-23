'use client';

import { useTranslate } from '@/i18n';
import TabHeader, { GearButton } from './TabHeader';

interface HeaderProps {
  isConnected: boolean;
  onSettingsOpen: () => void;
}

export default function StatusBar({ isConnected, onSettingsOpen }: HeaderProps) {
  const t = useTranslate('remote');
  return (
    <header className="px-5 pt-2">
      <TabHeader
        title={t('statusBar.title')}
        leading={(
          <>
            {/* Hub reachability only: a green dot does NOT mean any display is on.
                Display liveness is the hero's job (Offline / last seen). */}
            <span
              title={t(isConnected ? 'statusBar.hubConnected' : 'statusBar.hubDisconnected')}
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected
                  ? 'bg-hs-success shadow-[0_0_8px_color-mix(in_srgb,var(--hs-success)_40%,transparent)]'
                  : 'bg-hs-danger shadow-[0_0_8px_color-mix(in_srgb,var(--hs-danger)_40%,transparent)]'
              }`}
            />
            <span className="sr-only">
              {t(isConnected ? 'statusBar.hubConnected' : 'statusBar.hubDisconnected')}
            </span>
          </>
        )}
        actions={<GearButton label={t('statusBar.settingsAriaLabel')} onClick={onSettingsOpen} />}
      />
    </header>
  );
}
