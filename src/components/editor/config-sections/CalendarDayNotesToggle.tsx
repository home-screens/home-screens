'use client';

import Toggle from '@/components/ui/Toggle';
import { useFetchData } from '@/hooks/useFetchData';
import { useTranslate } from '@/i18n';
import { dayNotesUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

/**
 * "Day notes" in a calendar's What shows group, for the Calendar and the
 * Full-Screen Calendar alike. The notes are written on the phone, so the hint
 * says where; while none exist yet it says so, since a switch that is on with
 * nothing to show otherwise looks broken.
 */
export function CalendarDayNotesToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const t = useTranslate('editor');
  const [data] = useFetchData<{ notes?: Record<string, string> }>(dayNotesUrl(), FETCH_KEY_REGISTRY['day-notes'].ttlMs);
  const none = data !== null && Object.keys(data.notes ?? {}).length === 0;
  return (
    <div className="flex flex-col gap-1" data-field-id="showDayNotes">
      <Toggle label={t('configSections.calendarDayNotes.label')} checked={checked} onChange={onChange} />
      <p className="text-xs leading-relaxed text-hs-text-muted">
        {t(none ? 'configSections.calendarDayNotes.hintNone' : 'configSections.calendarDayNotes.hint')}
      </p>
    </div>
  );
}
