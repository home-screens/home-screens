'use client';

import { useMemo } from 'react';
import Combobox from '@/components/ui/Combobox';
import { listTimezoneValues, timezoneLabel } from '@/lib/timezone';
import type { ComboboxOption } from '@/lib/combobox-filter';
import { useTranslate } from '@/i18n';

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Label for the pinned `value: ''` default row (already translated, zone
   * name interpolated) — e.g. "Use display setting (Europe/Berlin)" in module
   * config panels, "Not picked yet" on the settings page.
   */
  defaultOptionLabel: string;
  ariaLabel: string;
  /** Forwarded to the Combobox input (label association, help text, styling tier). */
  id?: string;
  ariaDescribedBy?: string;
  inputClassName?: string;
}

/**
 * Timezone picker over the generic Combobox: each zone by `timezoneLabel`,
 * with the IANA id riding as the description so search matches "kolkata" as
 * well as "mumbai".
 */
export default function TimezoneSelect({
  value, onChange, defaultOptionLabel, ariaLabel, id, ariaDescribedBy, inputClassName,
}: TimezoneSelectProps) {
  const t = useTranslate('editor');
  const options = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: defaultOptionLabel, pinned: true },
      ...listTimezoneValues().map((zone): ComboboxOption => ({
        value: zone,
        label: timezoneLabel(zone),
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
      id={id}
      ariaDescribedBy={ariaDescribedBy}
      inputClassName={inputClassName}
      noMatchText={t('common.noMatches')}
    />
  );
}
