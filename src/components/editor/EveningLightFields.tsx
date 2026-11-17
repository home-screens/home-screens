'use client';

import type { EveningLight } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import PropertyGroup from './PropertyGroup';
import { EVENING_LIGHT_DEFAULT, isClockTime, normalizeEveningLight } from '@/lib/screen-hours';

/** Where "a set time" starts until the person changes it. */
const SET_TIME_DEFAULT = '20:00';

/**
 * Evening light for the picture behind a screen: on or off, when it starts
 * (sunset, or a time) and when it ends the next morning.
 */
export default function EveningLightFields({ screenId, eveningLight }: { screenId: string; eveningLight?: EveningLight }) {
  const t = useTranslate('editor');
  const updateScreen = useEditorStore((state) => state.updateScreen);
  const light = normalizeEveningLight(eveningLight);
  const save = (next: EveningLight | undefined) => updateScreen(screenId, { eveningLight: next });

  return (
    <PropertyGroup title={t('backgroundPicker.eveningGroup')} accent={3}>
      <div className="space-y-2" data-testid="evening-light-fields">
        <Toggle label={t('backgroundPicker.eveningToggle')} checked={!!light} onChange={(on) => save(on ? EVENING_LIGHT_DEFAULT : undefined)} />
        <p className="text-[10px] leading-relaxed text-hs-text-faint">{t('backgroundPicker.eveningHint')}</p>
        {light && (
          <>
            <LabeledSelect
              label={t('backgroundPicker.eveningFrom')}
              value={light.from === 'sunset' ? 'sunset' : 'time'}
              onChange={(from) => save({ ...light, from: from === 'sunset' ? 'sunset' : SET_TIME_DEFAULT })}
              options={[{ value: 'sunset', label: t('backgroundPicker.eveningFromSunset') }, { value: 'time', label: t('backgroundPicker.eveningFromTime') }]}
            />
            {light.from === 'sunset' ? (
              <p className="text-[10px] leading-relaxed text-hs-text-faint">{t('backgroundPicker.eveningSunsetHint')}</p>
            ) : (
              <input
                type="time" aria-label={t('backgroundPicker.eveningFromTime')} className={INPUT_CLASS} value={light.from}
                onChange={(e) => isClockTime(e.target.value) && save({ ...light, from: e.target.value })}
              />
            )}
            <LabeledField label={t('backgroundPicker.eveningUntil')} as="div">
              <input
                type="time" aria-label={t('backgroundPicker.eveningUntil')} className={INPUT_CLASS} value={light.until}
                onChange={(e) => isClockTime(e.target.value) && save({ ...light, until: e.target.value })}
              />
            </LabeledField>
          </>
        )}
      </div>
    </PropertyGroup>
  );
}
