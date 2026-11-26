import type { CalendarSettings, ScreenConfiguration } from '@/types/config';
import { rewriteConfigModules } from '@/lib/config-modules';
import { googleCalendarIdList } from '@/lib/calendar-sources';

/**
 * What else in a config names a calendar source by id, and what happens to
 * those names when the source goes: a feed removed, a Google calendar
 * unpicked or signed out, an iCloud calendar unticked or its account removed,
 * the public holidays turned off.
 *
 * Without this a person kept owning a calendar that no longer existed: their
 * row in Settings > Calendar > People had nothing left to untick, yet the
 * wall's family grid and free time views still listed them with an empty row.
 */

type SourceSettings = Partial<Pick<
  CalendarSettings,
  'googleCalendarIds' | 'icalSources' | 'icloudSources' | 'holidayCountry' | 'personSources'
>>;

/** Modules whose `sourceFilter` lists the calendar sources they show. */
const SOURCE_FILTER_MODULE_TYPES = new Set(['calendar', 'fullscreen-calendar', 'multi-month']);

/**
 * Every calendar source id the settings still have: the picked Google
 * calendars, the iCal feeds, the iCloud calendars and birthday lists, and the
 * public holidays. A source that is switched off still counts: it is there to
 * switch back on, and its owners with it.
 */
export function configuredCalendarSourceIds(calendar: SourceSettings | undefined): Set<string> {
  const ids = new Set<string>(calendar ? googleCalendarIdList(calendar) : []);
  for (const source of calendar?.icalSources ?? []) ids.add(source.id);
  for (const source of calendar?.icloudSources ?? []) ids.add(source.id);
  if (calendar?.holidayCountry) ids.add('holidays');
  return ids;
}

/** The ids `before` configured that `after` no longer does. */
export function removedCalendarSourceIds(
  before: SourceSettings | undefined,
  after: SourceSettings | undefined,
): Set<string> {
  const kept = configuredCalendarSourceIds(after);
  return new Set([...configuredCalendarSourceIds(before)].filter((id) => !kept.has(id)));
}

/**
 * Whose calendars are whose, keeping only sources in `keep`. A person left
 * with none is dropped, so they read as owning nothing everywhere. The same
 * object comes back when nothing goes.
 */
export function prunePersonSources<T extends Record<string, string[]> | undefined>(
  personSources: T,
  keep: (id: string) => boolean,
): T {
  if (!personSources) return personSources;
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const [memberId, ids] of Object.entries(personSources)) {
    const kept = ids.filter(keep);
    if (kept.length !== ids.length || kept.length === 0) changed = true;
    if (kept.length > 0) next[memberId] = kept;
  }
  return (changed ? next : personSources) as T;
}

/**
 * Whose calendars are whose after an edit in Settings > Calendar. A calendar
 * that can be ticked again (Google, iCloud and the holidays keep their ids)
 * keeps its owners, as it keeps its name and colour; a removed calendar link
 * never comes back under its id, so its owners let go. The same object comes
 * back when nothing goes.
 */
export function ownersAfterEdit<T extends Record<string, string[]> | undefined>(
  personSources: T,
  feedsBefore: readonly { id: string }[] | undefined,
  feedsAfter: readonly { id: string }[] | undefined,
): T {
  const left = new Set((feedsAfter ?? []).map((feed) => feed.id));
  const gone = new Set((feedsBefore ?? []).map((feed) => feed.id).filter((id) => !left.has(id)));
  return gone.size === 0 ? personSources : prunePersonSources(personSources, (id) => !gone.has(id));
}

/**
 * The person-to-calendar mapping as it stands today: owners of sources that
 * are gone count for nothing. Readers of `personSources` go through this, so
 * an install that saved a dangling id before removals pruned it heals on read.
 */
export function livePersonSources(calendar: SourceSettings | undefined): Record<string, string[]> | undefined {
  if (!calendar?.personSources) return undefined;
  const configured = configuredCalendarSourceIds(calendar);
  return prunePersonSources(calendar.personSources, (id) => configured.has(id));
}

/** True when someone owns at least one calendar that still exists. */
export function hasCalendarOwners(calendar: SourceSettings | undefined): boolean {
  return Object.keys(livePersonSources(calendar) ?? {}).length > 0;
}

/**
 * The config once the calendar sources `before` had and `config` no longer
 * does are gone: they come out of every calendar module's own source list. A
 * module whose list named only removed calendars goes back to showing every
 * calendar, the same as unticking its last one in the editor.
 *
 * Whose calendars are whose follows `ownersAfterEdit`, as the open Settings
 * page does: a removed calendar link lets its owners go, while an unticked
 * Google or iCloud calendar keeps them for when it is ticked again (readers
 * meanwhile go through `livePersonSources`, which leaves them out). Saving
 * the untick used to drop them, so leaving Settings and coming back lost them.
 *
 * Event and day rules are left alone: a removed id there can no longer match
 * anything, while taking it out of a rule that named only that calendar would
 * widen the rule to every event on the wall. So are the household's names and
 * colours (`calendarOverrides`): ticking the calendar again brings them back.
 * Returns `config` itself when nothing named a removed source.
 */
export function pruneCalendarSourceRefs(config: ScreenConfiguration, before: SourceSettings | undefined): ScreenConfiguration {
  const calendar = config.settings.calendar;
  const removed = removedCalendarSourceIds(before, calendar);
  if (removed.size === 0) return config;
  const keep = (id: string) => !removed.has(id);
  let next = config;

  const personSources = ownersAfterEdit(calendar?.personSources, before?.icalSources, calendar?.icalSources);
  if (calendar && personSources !== calendar.personSources) {
    next = { ...next, settings: { ...next.settings, calendar: { ...calendar, personSources } } };
  }

  return rewriteConfigModules(next, (m) => {
    const filter = m.config.sourceFilter;
    if (!SOURCE_FILTER_MODULE_TYPES.has(m.type) || !Array.isArray(filter)) return m;
    const kept = (filter as string[]).filter(keep);
    if (kept.length === filter.length) return m;
    const { sourceFilter: _dropped, ...rest } = m.config;
    return { ...m, config: kept.length > 0 ? { ...rest, sourceFilter: kept } : rest };
  });
}
