'use client';

import Link from 'next/link';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';

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
            className="mt-1.5 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="">{t('settings.perDisplayPage.profile.noneOption')}</option>
            {profilePool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-hs-text-faint mt-1.5">
            {t('settings.perDisplayPage.profile.helpPart1', { name: display.name })}
            <Link
              href="?section=defaults&page=profiles"
              className="text-hs-accent hover:text-hs-accent-hover underline decoration-dashed underline-offset-2"
            >
              {t('settings.perDisplayPage.profile.helpLink')}
            </Link>
            {t('settings.perDisplayPage.profile.helpPart2')}
          </p>
        </label>
      </div>
    </div>
  );
}
