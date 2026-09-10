'use client';

import Link from 'next/link';
import { useTranslate } from '@/i18n';
import { useFamilyData } from '@/hooks/useFamilyData';
import { settingsHref } from '@/lib/settings-route';
import { useCalendarSources } from '@/components/editor/config-sections/CalendarSourceFilter';

interface CalendarPeopleManagerProps {
  personSources: Record<string, string[]>;
  onChange: (personSources: Record<string, string[]>) => void;
}

/** Calendar owns source mappings; names and colours come from the family roster. */
export default function CalendarPeopleManager({ personSources, onChange }: CalendarPeopleManagerProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { members, loading, error } = useFamilyData();
  const { availableSources } = useCalendarSources('configSections.fullscreen-calendar');
  const sources = availableSources.filter((source) => source.id !== 'holidays');
  const familyHref = settingsHref({ kind: 'defaults', page: 'family' });

  return <section className="space-y-4">
    {loading && <p className="text-sm text-hs-text-muted">{tCore('loading')}</p>}
    {error && <p role="alert" className="text-sm text-hs-danger">{tCore('family.loadFailed')}</p>}
    {!loading && !error && members.length === 0 && <p className="text-sm text-hs-text-muted">{t('settings.calendarPage.people.noPeople')}</p>}
    <Link href={familyHref} className="inline-block text-sm text-hs-accent hover:underline">{t('settings.calendarPage.people.manageFamily')}</Link>
    {members.map((member) => <fieldset key={member.id} className="rounded-xl border border-hs-border p-3">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium text-hs-text-primary">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: member.color }} />{member.name}
      </legend>
      {sources.length === 0 && <p className="text-xs text-hs-text-muted">{t('settings.calendarPage.people.noSources')}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {sources.map((source) => <label key={source.id} className="flex min-h-9 items-center gap-2 text-sm text-hs-text-body">
          <input type="checkbox" className="h-4 w-4 accent-hs-accent" checked={(personSources[member.id] ?? []).includes(source.id)} onChange={(event) => {
            const current = personSources[member.id] ?? [];
            onChange({ ...personSources, [member.id]: event.target.checked ? [...new Set([...current, source.id])] : current.filter((id) => id !== source.id) });
          }} />
          {source.name}
        </label>)}
      </div>
    </fieldset>)}
  </section>;
}
