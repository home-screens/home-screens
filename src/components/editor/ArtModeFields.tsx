'use client';

import type { ArtMode } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import PropertyGroup from './PropertyGroup';
import { ART_MODE_HOURS_DEFAULT, isClockTime } from '@/lib/screen-hours';

/** Art mode for a screen: its modules step aside, always or between two times of day, and the screen dots with them when asked. */
export default function ArtModeFields({ screenId, artMode }: { screenId: string; artMode?: ArtMode }) {
  const t = useTranslate('editor');
  const updateScreen = useEditorStore((state) => state.updateScreen);
  const save = (next: ArtMode | undefined) => updateScreen(screenId, { artMode: next });
  const hours = !!artMode && isClockTime(artMode.from) && isClockTime(artMode.until);
  // What art mode hides is kept when its hours change.
  const hideDots = artMode?.hideDots ? { hideDots: true as const } : {};

  return (
    <PropertyGroup title={t('screenSettings.artModeGroup')} accent={2}>
      <div className="space-y-2" data-testid="art-mode-fields">
        <Toggle
          label={t('screenSettings.artModeToggle')}
          checked={!!artMode}
          onChange={(on) => save(on ? {} : undefined)}
          description={t('screenSettings.artModeHint')}
        />
        {artMode && (
          <>
            <LabeledSelect
              label={t('screenSettings.artModeWhen')}
              value={hours ? 'hours' : 'always'}
              onChange={(when) => save(when === 'hours' ? { ...ART_MODE_HOURS_DEFAULT, ...hideDots } : hideDots)}
              options={[{ value: 'always', label: t('screenSettings.artModeAlways') }, { value: 'hours', label: t('screenSettings.artModeBetween') }]}
            />
            {hours && (
              <div className="flex items-center gap-2">
                <input
                  type="time" aria-label={t('screenSettings.artModeFrom')} className={INPUT_CLASS} value={artMode.from}
                  onChange={(e) => isClockTime(e.target.value) && save({ ...artMode, from: e.target.value })}
                />
                <input
                  type="time" aria-label={t('screenSettings.artModeUntil')} className={INPUT_CLASS} value={artMode.until}
                  onChange={(e) => isClockTime(e.target.value) && save({ ...artMode, until: e.target.value })}
                />
              </div>
            )}
            <div>
              <Toggle
                label={t('screenSettings.artModeHideDots')}
                checked={!!artMode.hideDots}
                onChange={(on) => save({ ...(hours ? { from: artMode.from, until: artMode.until } : {}), ...(on ? { hideDots: true } : {}) })}
                description={t('screenSettings.artModeHideDotsHint')}
              />
            </div>
          </>
        )}
      </div>
    </PropertyGroup>
  );
}
