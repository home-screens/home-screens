'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useEditorStore } from '@/stores/editor-store';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import { hasPeopleFilter, resolvePeopleFilterMembers } from '@/lib/family-groups';
import { livePersonSources } from '@/lib/calendar-source-refs';
import type { CalendarLegendMode, CalendarPeopleFilter as PeopleFilterValue } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';

/**
 * The roster as the calendar sections see it: every family member, every
 * group, and who owns at least one calendar that still exists (Settings >
 * Calendar > People). Both calendar modules read the same three facts, so
 * they come from here.
 */
export function useCalendarRoster() {
  const { members, groups, loading } = useFamilyData();
  const calendar = useEditorStore((s) => s.config?.settings?.calendar);
  const owners = useMemo(() => {
    const personSources = livePersonSources(calendar) ?? {};
    return members.filter((member) => (personSources[member.id] ?? []).length > 0);
  }, [members, calendar]);
  return { members, groups, owners, loading };
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-hs-text-muted">{children}</p>;
}

function MatchCalendarsLink() {
  const t = useTranslate('editor');
  return (
    <Link href={settingsPath({ kind: 'defaults', page: 'calendar' })} className="text-hs-accent hover:underline">
      {t('configSections.calendarPeople.matchCalendars')}
    </Link>
  );
}

/** Name tags toggle with the "who" rule stated under it; explains the empty roster instead of hiding. */
export function NameTagsToggle({ checked, onChange, owners }: { checked: boolean; onChange: (next: boolean) => void; owners: FamilyMember[] }) {
  const t = useTranslate('editor');
  return (
    <div className="flex flex-col gap-1" data-field-id="showNameTags">
      <Toggle label={t('configSections.calendarPeople.showNameTags')} checked={checked} onChange={onChange} />
      <Hint>
        {owners.length > 0 ? t('configSections.calendarPeople.nameTagsHint') : t('configSections.calendarPeople.nameTagsNoOwners')}
        {' '}<MatchCalendarsLink />
      </Hint>
    </div>
  );
}

/** "Key lists": what the color key names. People and Groups wait for calendar owners. */
export function LegendModeSelect({ value, onChange, owners, groups }: {
  value: CalendarLegendMode; onChange: (next: CalendarLegendMode) => void; owners: FamilyMember[]; groups: FamilyGroup[];
}) {
  const t = useTranslate('editor');
  const hasOwners = owners.length > 0;
  const options: { value: CalendarLegendMode; label: string }[] = [
    { value: 'calendars', label: t('configSections.calendarPeople.legendModeCalendars') },
    ...(hasOwners ? [{ value: 'people' as const, label: t('configSections.calendarPeople.legendModePeople') }] : []),
    ...(hasOwners && groups.length > 0 ? [{ value: 'groups' as const, label: t('configSections.calendarPeople.legendModeGroups') }] : []),
  ];
  const shown = options.some((option) => option.value === value) ? value : 'calendars';
  return (
    <div className="flex flex-col gap-1" data-field-id="legendMode">
      <LabeledSelect label={t('configSections.calendarPeople.legendMode')} value={shown} onChange={onChange} options={options} />
      {!hasOwners && <Hint>{t('configSections.calendarPeople.legendModeNeedsPeople')} <MatchCalendarsLink /></Hint>}
    </div>
  );
}

function Stack({ members }: { members: FamilyMember[] }) {
  return (
    <span className="inline-flex shrink-0" aria-hidden="true">
      {members.slice(0, 5).map((member, index) => (
        <span key={member.id} className={`h-3.5 w-3.5 rounded-full ring-[1.5px] ring-hs-card ${index > 0 ? '-ml-1.5' : ''}`} style={{ backgroundColor: member.color }} />
      ))}
    </span>
  );
}

const EMPTY_FILTER: PeopleFilterValue = { memberIds: [], groupIds: [], includeShared: true };

/**
 * "Show only these people": groups first, then people, then the shared
 * toggle. Empty member and group lists clear the filter (undefined), so a
 * screen that never picked anyone carries no field at all.
 */
export function CalendarPeopleFilter({ value, onChange, members, groups, owners }: {
  value: PeopleFilterValue | undefined;
  onChange: (next: PeopleFilterValue | undefined) => void;
  members: FamilyMember[];
  groups: FamilyGroup[];
  owners: FamilyMember[];
}) {
  const t = useTranslate('editor');
  const filter = value ?? EMPTY_FILTER;
  const active = hasPeopleFilter(value);
  const chosen = useMemo(() => {
    if (!active) return [];
    const ids = resolvePeopleFilterMembers(filter, groups);
    return members.filter((member) => ids.has(member.id));
  }, [active, filter, groups, members]);

  function update(next: PeopleFilterValue) {
    onChange(next.memberIds.length === 0 && next.groupIds.length === 0 ? undefined : next);
  }
  // Ids the roster no longer has (someone removed, a group deleted) stay
  // visible as removable rows, so a screen can never be stuck filtered on
  // a choice its owner cannot see.
  const staleMembers = filter.memberIds.filter((id) => !members.some((member) => member.id === id));
  const staleGroups = filter.groupIds.filter((id) => !groups.some((group) => group.id === id));
  const toggle = (key: 'memberIds' | 'groupIds', id: string, checked: boolean) =>
    update({ ...filter, [key]: checked ? [...filter[key], id] : filter[key].filter((existing) => existing !== id) });

  const checkbox = 'rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0';
  const row = 'flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover';
  const heading = 'px-3 pt-1.5 text-[11px] font-semibold text-hs-text-faint';

  return (
    <div className="flex flex-col gap-1" data-field-id="peopleFilter">
      <span className="text-xs text-hs-text-muted">{t('configSections.calendarPeople.peopleFilter')}</span>
      {owners.length === 0 && groups.length === 0 && !active ? (
        <Hint>{t('configSections.calendarPeople.peopleFilterEmpty')} <MatchCalendarsLink /></Hint>
      ) : (
        <>
          <div className="rounded-md bg-hs-card border border-hs-border-strong max-h-56 overflow-y-auto">
            {groups.length > 0 && <div className={heading}>{t('configSections.calendarPeople.peopleFilterGroups')}</div>}
            {groups.map((group) => (
              <label key={group.id} className={row}>
                <input type="checkbox" className={checkbox} checked={filter.groupIds.includes(group.id)} onChange={(event) => toggle('groupIds', group.id, event.target.checked)} />
                <Stack members={members.filter((member) => group.memberIds.includes(member.id))} />
                <span className="text-sm text-hs-text-body truncate">{group.name}</span>
              </label>
            ))}
            {members.length > 0 && <div className={heading}>{t('configSections.calendarPeople.peopleFilterPeople')}</div>}
            {members.map((member) => (
              <label key={member.id} className={row}>
                <input type="checkbox" className={checkbox} checked={filter.memberIds.includes(member.id)} onChange={(event) => toggle('memberIds', member.id, event.target.checked)} />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: member.color }} aria-hidden="true" />
                <span className="text-sm text-hs-text-body truncate">{member.name}</span>
              </label>
            ))}
            {staleGroups.map((id) => (
              <label key={`stale-group-${id}`} className={row} data-stale-selection="group">
                <input type="checkbox" className={checkbox} checked onChange={() => toggle('groupIds', id, false)} />
                <span className="text-sm italic text-hs-text-muted truncate">{t('configSections.calendarPeople.peopleFilterStaleGroup')}</span>
              </label>
            ))}
            {staleMembers.map((id) => (
              <label key={`stale-member-${id}`} className={row} data-stale-selection="member">
                <input type="checkbox" className={checkbox} checked onChange={() => toggle('memberIds', id, false)} />
                <span className="text-sm italic text-hs-text-muted truncate">{t('configSections.calendarPeople.peopleFilterStaleMember')}</span>
              </label>
            ))}
          </div>
          {active && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <label className="flex items-center gap-2.5 py-1 cursor-pointer">
                <input type="checkbox" className={checkbox} checked={filter.includeShared !== false} onChange={(event) => update({ ...filter, includeShared: event.target.checked })} />
                <span className="text-sm text-hs-text-body">{t('configSections.calendarPeople.includeShared')}</span>
              </label>
              <button type="button" className="text-xs text-hs-accent hover:underline" onClick={() => onChange(undefined)}>{t('configSections.calendarPeople.peopleFilterClear')}</button>
            </div>
          )}
          <Hint>
            {!active
              ? t('configSections.calendarPeople.peopleFilterHint')
              : chosen.length === 0
                ? t('configSections.calendarPeople.peopleFilterNobody')
                : t(filter.includeShared !== false ? 'configSections.calendarPeople.peopleFilterShowingShared' : 'configSections.calendarPeople.peopleFilterShowing', { names: chosen.map((member) => member.name).join(', ') })}
          </Hint>
        </>
      )}
    </div>
  );
}
