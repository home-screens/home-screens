'use client';

import { useMemo } from 'react';
import Combobox from '@/components/ui/Combobox';
import { COMMON_TIMEZONES, listTimezoneValues } from '@/lib/timezone';
import type { ComboboxOption } from '@/lib/combobox-filter';
import { useTranslate } from '@/i18n';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for the pinned `value: ''` default row (already translated, zone
   * name interpolated) — e.g. "Use display setting (Europe/Berlin)" in module
   * config panels, "System default (Europe/Berlin)" on the settings page.
   */
  defaultOptionLabel: string;
  ariaLabel: string;
}

const CURATED_LABELS = new Map(COMMON_TIMEZONES.map((tz) => [tz.value, tz.label]));

/**
 * Timezone picker over the generic Combobox: friendly label for curated
 * zones (COMMON_TIMEZONES), city segment otherwise; the IANA id rides as the
 * description so search matches "kolkata" as well as "mumbai".
 */
export default function TimezoneSelect({ value, onChange, defaultOptionLabel, ariaLabel }: TimezoneSelectProps) {
  const t = useTranslate('editor');
  const options = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: defaultOptionLabel, pinned: true },
      ...listTimezoneValues().map((zone): ComboboxOption => ({
        value: zone,
        label: CURATED_LABELS.get(zone) ?? zone.split('/').pop()!.replace(/_/g, ' '),
        // Zone-less ids like "UTC" would render as "UTC (UTC)" when closed.
        description: zone.includes('/') ? zone : undefined,
      })),
    ],
    [defaultOptionLabel],
  );

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      noMatchText={t('common.noMatches')}
    />
  );
}
