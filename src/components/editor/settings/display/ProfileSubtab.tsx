'use client';

import Link from 'next/link';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import { settingsHref } from '@/lib/settings-route';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import { defaultsPlaceText } from '@/components/editor/settings/useDefaultsPageHeader';

interface ProfileSubtabProps {
  config: ScreenConfiguration;
  display: DisplayNode;
}

/**
 * Display detail "Profile" — picks which profile this display is showing
 * right now.
 *
 * Profile *definitions* live on the shared `Defaults → Profiles` page —
 * the per-display Profile subtab only handles the per-display
 * `activeProfile` field. This split was a load-bearing part of the
 * redesign: the legacy ProfilesSection had a display switcher because
 * "active profile is per-display" but the user was simultaneously editing
 * profile definitions (shared), conflating two very different jobs into
 * one tab.
 *
 * The "owned profiles" mode (display.profiles is set) is a different
 * flow — its profile definitions live on this display, not in the
 * shared pool. We render whichever pool is in effect; the
 * `getDisplayProfiles`-style precedence is the same one
 * `filterConfigForDisplay` uses on the server.
 */
export default function ProfileSubtab({ config, display }: ProfileSubtabProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { updateDisplay, saveConfig } = useEditorStore();
  const profilePool = display.profiles ?? config.profiles ?? [];
  const activeProfileId = display.activeProfile ?? config.settings.activeProfile ?? '';

  const handleActiveProfileChange = async (value: string) => {
    updateDisplay(display.id, { activeProfile: value || undefined });
    await saveConfig();
  };

  return (
    <div className="rounded-lg border border-hs-border bg-hs-panel/40">
      <div className="px-4 py-3.5">
        <label className="block">
          <span className="text-xs text-hs-text-muted">
            {t('settings.perDisplayPage.profile.activeProfileLabel')}
          </span>
          <select
            value={activeProfileId}
            onChange={(e) => handleActiveProfileChange(e.target.value)}
            className={`mt-1.5 block w-full ${SETTINGS_INPUT_CLASS}`}
          >
            <option value="">{t('settings.perDisplayPage.profile.noneOption')}</option>
            {profilePool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <FieldHint className="mt-1.5">
            {t('settings.perDisplayPage.profile.helpPart1', { name: display.name })}
            <Link
              href={settingsHref({ kind: 'defaults', page: 'automation' })}
              className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
            >
              {defaultsPlaceText(t, tCore, 'automation')}
            </Link>
            {t('settings.perDisplayPage.profile.helpPart2')}
          </FieldHint>
        </label>
      </div>
    </div>
  );
}
