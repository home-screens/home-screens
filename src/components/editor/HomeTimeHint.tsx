'use client';

import { useFormattingLocale, useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdZone } from '@/components/editor/useEditorHouseholdClock';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import { useRealClock } from '@/hooks/useTZClock';
import { useViewerTimezone } from '@/hooks/useViewerTimezone';
import { viewerAwayFromHome } from '@/lib/home-time';
import { formatTimeInTZ, timezoneLabel } from '@/lib/timezone';
import FieldHint from '@/components/ui/FieldHint';

/**
 * A quiet line under a time field that means home time, shown only while this
 * computer is in another zone: "Home time (Chicago). It is 12:46 PM at home."
 * A parent in Los Angeles typing 7:00 into a schedule otherwise has no way to
 * know it is 7:00 in Chicago.
 */
export default function HomeTimeHint({ className = 'mt-1.5' }: { className?: string }) {
  const t = useTranslate('editor');
  const home = useEditorHouseholdZone();
  const away = viewerAwayFromHome(useViewerTimezone(), home?.timezone);
  const now = useRealClock(15_000, away);
  const locale = useFormattingLocale();
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat));

  if (!away || !home) return null;
  const time = formatTimeInTZ(now, { timezone: home.timezone, locale, hour12: timeFormat === '12h' });
  return (
    <FieldHint data-testid="home-time-hint" className={`${className} flex items-start gap-1.5`}>
      <span aria-hidden="true" className="text-hs-accent">&#9719;</span>
      <span>{t('homeTime.hint', { city: timezoneLabel(home.timezone), time })}</span>
    </FieldHint>
  );
}
