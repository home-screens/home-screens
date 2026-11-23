import { wallClockParts, isoDateInTZ } from './timezone';
import type { ChangeScope, EventDraft, RepeatReading, RepeatRule, TimeWasInput } from './calendar-write';

/**
 * What the phone's and the wall's event forms decide the same way: what
 * counts as a change, which days a save reaches, what is sent to the hub and
 * what a refusal does next. The markup is each surface's own; a rule written
 * in both is how one of them ends up without a branch the other has. Pure
 * and free of server imports, like calendar-write.ts beside it.
 */

/** `HH:MM` as minutes after midnight. */
export function minutesOfTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes after midnight as `HH:MM`, wrapping past either end of the day. */
export function timeOfMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Where a new event starts until someone picks: the next whole hour today,
 * 9:00 on any other day, in minutes after midnight. "Today" and the hour are
 * both the household's, whatever clock the phone or the wall's own computer
 * keeps. The next hour after 11 PM is 1440; each form holds it to what it can
 * show.
 */
export function defaultStartMinutes(date: string, now: Date, timezone: string): number {
  if (date !== isoDateInTZ(now, timezone)) return 9 * 60;
  return (Math.floor(wallClockParts(now, timezone).minuteOfDay / 60) + 1) * 60;
}

/** The event loaded for Change, as far as the forms' shared rules read it (the Google and iCloud shapes both fit). */
export interface LoadedEvent {
  etag: string;
  seriesId?: string;
  seriesEtag?: string;
  /** iCloud only: the calendar object's address. */
  sourceRef?: string;
  draft: EventDraft;
  repeat: RepeatReading;
}

/** Whether the form may change how the event repeats; a repeat set up elsewhere in a way the forms cannot show is left alone. */
export function repeatEditable(loaded: Pick<LoadedEvent, 'repeat'> | null | undefined): boolean {
  return loaded?.repeat.kind !== 'other';
}

/** Whether the Repeats field itself was changed, which can only mean every time. */
export function repeatWasChanged(repeat: RepeatRule | null | undefined, loaded: Pick<LoadedEvent, 'repeat'> | null | undefined): boolean {
  if (!loaded || !repeatEditable(loaded)) return false;
  return JSON.stringify(repeat ?? null) !== JSON.stringify(loaded.repeat.kind === 'known' ? loaded.repeat.rule : null);
}

function whenOf(draft: EventDraft): string {
  return draft.allDay
    ? JSON.stringify([draft.date, true, draft.lastDate ?? draft.date])
    : JSON.stringify([draft.date, false, draft.startTime, draft.endTime]);
}

/**
 * Whether the family changed when the event happens: its day, all day or
 * not, or its times. Only then are times sent, so a new name or place can
 * never move or shorten an event.
 */
export function timesWereChanged(draft: EventDraft, loaded: EventDraft): boolean {
  return whenOf(draft) !== whenOf(loaded);
}

/** The draft as the hub takes it: only the fields its shape has, and no repeat when the form could not change it. */
export function draftToSend(draft: EventDraft, opts: { repeatEditable: boolean }): EventDraft {
  const sent: EventDraft = draft.allDay
    ? { title: draft.title, date: draft.date, allDay: true, lastDate: draft.lastDate ?? draft.date, location: draft.location }
    : {
        title: draft.title, date: draft.date, allDay: false, startTime: draft.startTime, endTime: draft.endTime,
        ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
        location: draft.location,
      };
  // A repeat set up elsewhere is left exactly as it is.
  if (opts.repeatEditable) sent.repeat = draft.repeat ?? null;
  return sent;
}

/**
 * What saving a change does: one day of a repeating event asks which days,
 * unless its repeat was changed, which can only mean every time; anything
 * else is the one event.
 */
export function saveScope(loaded: Pick<LoadedEvent, 'seriesId'> | null | undefined, repeatChanged: boolean): 'ask' | ChangeScope {
  if (!loaded?.seriesId) return 'instance';
  return repeatChanged ? 'series' : 'ask';
}

function timeWasOf(draft: EventDraft): TimeWasInput | undefined {
  if (draft.allDay) return { allDay: true, lastDate: draft.lastDate ?? draft.date };
  // An event of a day or more has no length the two clock times can tell, and its times cannot change here anyway.
  if (draft.endDate !== undefined) return undefined;
  return { allDay: false, startTime: draft.startTime, endTime: draft.endTime };
}

/** The body of `PATCH /api/calendar/events/:id` for a change to `loaded`. */
export function changeRequestBody(
  loaded: LoadedEvent,
  change: { draft: EventDraft; scope: ChangeScope; repeatChanged: boolean },
): Record<string, unknown> {
  const timeWas = timeWasOf(loaded.draft);
  return {
    draft: change.draft,
    // The version the form loaded: the series' own for every time.
    etag: change.scope === 'series' ? loaded.seriesEtag : loaded.etag,
    scope: change.scope,
    seriesId: loaded.seriesId,
    ...(loaded.sourceRef ? { sourceRef: loaded.sourceRef } : {}),
    // Where the day stood when the form opened, which "every time" moves the series from.
    dayWas: loaded.draft.date,
    ...(timeWas ? { timeWas } : {}),
    repeatChanged: change.repeatChanged,
    timesChanged: timesWereChanged(change.draft, loaded.draft),
  };
}

/**
 * What a form does when the hub turns a change down:
 * - `reload`: someone changed the event elsewhere. Load the newest version
 *   into the form and say so; nothing was overwritten.
 * - `close`: the event is gone, so no retry can work. Close the form, say
 *   so, and read the calendar again.
 * - `stay`: keep what was typed and show the reason.
 */
export function afterChangeRefusal(code: string | null | undefined): 'reload' | 'close' | 'stay' {
  if (code === 'calendarWrite.changedElsewhere') return 'reload';
  if (code === 'calendarWrite.gone') return 'close';
  return 'stay';
}
