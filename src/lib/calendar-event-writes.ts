import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { householdTimezone } from '@/lib/household-day';
import { googleCalendarIdList } from '@/lib/calendar-sources';
import { bumpCalendarRevision } from '@/lib/calendar-revision';
import { calendarLook } from '@/lib/calendar-overrides';
import { createRateLimiter, getClientIP } from '@/lib/api-utils';
import {
  CalendarWriteError,
  anyWallMayWrite,
  checkChangeScope,
  entryCalendarIds,
  normalizeEventDraft,
  splitGoogleEventId,
  type ChangeScope,
  type EventDraft,
  type GoogleEntryState,
} from '@/lib/calendar-write';
import type { ScreenConfiguration } from '@/types/config';

/**
 * The hub's side of adding, changing and removing calendar events: who is
 * asking, whether that calendar takes changes, and which source writes it.
 * The rules themselves are calendar-write.ts; the Google calls are
 * google-calendar-write.ts.
 */

/** A phone or the editor (a signed-in session), or a wall (the display token). */
export type Caller = 'session' | 'wall';

/** Called inside `withDisplayAuth`, which has already let the request in one way or the other. */
export async function callerOf(request: NextRequest): Promise<Caller> {
  try {
    await requireSession(request);
    return 'session';
  } catch {
    return 'wall';
  }
}

// A wall taps; a few writes a minute is plenty. Keyed by address, since every
// kiosk shares one token.
const WRITES_PER_MINUTE = 20;
const limiter = createRateLimiter(WRITES_PER_MINUTE, 60_000);

/** Count a write against the asker's minute, refusing once the minute is full. */
export function countWrite(request: NextRequest): void {
  const ip = getClientIP(request);
  if (limiter.isLimited(ip)) {
    throw new CalendarWriteError('calendarWrite.unreachable', 'Too many changes at once. Wait a minute and try again.', undefined, { status: 429 });
  }
  limiter.recordFailure(ip);
}

/** @internal test hook */
export function clearWriteLimits(ip = 'unknown'): void {
  limiter.clear(ip);
}

export interface WriteContext {
  config: ScreenConfiguration;
  timezone: string;
  googleIds: string[];
  /** Calendars events may go on now: ticked for adding and shown. */
  entryIds: string[];
}

export async function writeContext(): Promise<WriteContext> {
  const config = await readConfig();
  const calendar = config.settings.calendar;
  const googleIds = googleCalendarIdList(calendar);
  const icloudIds = (calendar.icloudSources ?? []).filter((s) => s.enabled).map((s) => s.id);
  return {
    config,
    timezone: await householdTimezone(),
    googleIds,
    entryIds: entryCalendarIds(calendar.eventEntry, [...googleIds, ...icloudIds]),
  };
}

/**
 * Whether `calendarId` takes changes from this caller now. Refuses with the
 * reason the phone or the wall shows. The per-display switch is checked on
 * the wall itself: the hub only knows a wall asked, not which one.
 */
export async function assertMayWrite(ctx: WriteContext, calendarId: string, caller: Caller): Promise<'google' | 'icloud'> {
  const entry = ctx.config.settings.calendar.eventEntry;
  if (!entry?.enabled) {
    throw new CalendarWriteError('calendarWrite.notOffered', 'Adding events is turned off in Settings > Calendar.', undefined, { status: 403 });
  }
  if (caller === 'wall' && !anyWallMayWrite(ctx.config.settings, ctx.config.displays)) {
    throw new CalendarWriteError('calendarWrite.notOffered', 'The walls cannot add events.', undefined, { status: 403 });
  }
  if (!ctx.entryIds.includes(calendarId)) {
    throw new CalendarWriteError('calendarWrite.calendarNotTicked', "Events can't go on that calendar.", undefined, { status: 403 });
  }
  if (!ctx.googleIds.includes(calendarId)) return 'icloud';
  const { getGoogleEntryState } = await import('@/lib/google-auth');
  if ((await getGoogleEntryState(true)) !== 'ready') {
    throw new CalendarWriteError('calendarWrite.notOffered', 'Google needs one more sign-in before events can be added.', undefined, { status: 403 });
  }
  return 'google';
}

/** The calendar and the source's own id for a wall event id, against the calendars that take changes. */
export function locateEvent(ctx: WriteContext, id: string): { calendarId: string; eventId: string } {
  const found = splitGoogleEventId(id, ctx.entryIds);
  if (!found) throw new CalendarWriteError('calendarWrite.notEditable', "That event can't be changed here.", undefined, { status: 403 });
  return found;
}

/** The iCloud calendar and its account, for a calendar id that takes events. */
async function icloudTarget(ctx: WriteContext, calendarId: string) {
  const source = (ctx.config.settings.calendar.icloudSources ?? []).find((s) => s.id === calendarId && s.enabled);
  const { getICloudAccount } = await import('@/lib/icloud-accounts');
  const account = source ? await getICloudAccount(source.accountId) : null;
  if (!source || !account) {
    throw new CalendarWriteError('calendarWrite.signInNeeded', 'That iCloud account is no longer connected.', undefined, { status: 403 });
  }
  return { source, account };
}

/** The iCloud object an event lives in, which the form sent back; checked against the calendar by the writer. */
function sourceRefOf(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new CalendarWriteError('calendarWrite.notEditable', "That event can't be changed here.", undefined, { status: 403 });
  return value;
}

// ── The four writes ───────────────────────────────────────────────────

export async function addEvent(request: NextRequest, input: { calendarId?: unknown; draft?: unknown }): Promise<{ id: string }> {
  if (typeof input.calendarId !== 'string' || !input.draft || typeof input.draft !== 'object') {
    throw new CalendarWriteError('calendarWrite.badDate', 'That event does not look right.');
  }
  const caller = await callerOf(request);
  const ctx = await writeContext();
  const source = await assertMayWrite(ctx, input.calendarId, caller);
  const event = normalizeEventDraft(input.draft as EventDraft, { timezone: ctx.timezone });
  countWrite(request);
  let created: { id: string };
  if (source === 'icloud') {
    const { source: icloud, account } = await icloudTarget(ctx, input.calendarId);
    const { createICloudEvent } = await import('@/lib/icloud-calendar-write');
    created = await createICloudEvent(icloud, account, event);
  } else {
    const { createGoogleEvent } = await import('@/lib/google-calendar-write');
    created = await createGoogleEvent(input.calendarId, event);
  }
  bumpCalendarRevision();
  return created;
}

/** `sourceRef` is the iCloud object's address the event carried (`?ref=`); Google needs none. */
export async function eventForEdit(request: NextRequest, id: string, sourceRef?: string | null) {
  const caller = await callerOf(request);
  const ctx = await writeContext();
  const { calendarId, eventId } = locateEvent(ctx, id);
  const source = await assertMayWrite(ctx, calendarId, caller);
  if (source === 'icloud') {
    const { source: icloud, account } = await icloudTarget(ctx, calendarId);
    const { getICloudEventForEdit } = await import('@/lib/icloud-calendar-write');
    return getICloudEventForEdit(icloud, account, { eventId, sourceRef: sourceRefOf(sourceRef), timezone: ctx.timezone });
  }
  const { getGoogleEventForEdit } = await import('@/lib/google-calendar-write');
  return getGoogleEventForEdit(calendarId, eventId, ctx.timezone);
}

function scopeOf(value: unknown): ChangeScope {
  return value === 'series' ? 'series' : 'instance';
}

export async function changeEvent(
  request: NextRequest,
  id: string,
  input: { draft?: unknown; etag?: unknown; scope?: unknown; seriesId?: unknown; sourceRef?: unknown; dayWas?: unknown; repeatChanged?: unknown },
): Promise<void> {
  if (!input.draft || typeof input.draft !== 'object' || typeof input.etag !== 'string' || typeof input.dayWas !== 'string') {
    throw new CalendarWriteError('calendarWrite.badDate', 'That change does not look right.');
  }
  const caller = await callerOf(request);
  const ctx = await writeContext();
  const { calendarId, eventId } = locateEvent(ctx, id);
  const source = await assertMayWrite(ctx, calendarId, caller);
  const scope = scopeOf(input.scope);
  const repeatChanged = input.repeatChanged === true;
  checkChangeScope(scope, repeatChanged);
  const event = normalizeEventDraft(input.draft as EventDraft, { timezone: ctx.timezone });
  countWrite(request);
  if (source === 'icloud') {
    const { source: icloud, account } = await icloudTarget(ctx, calendarId);
    const { updateICloudEvent } = await import('@/lib/icloud-calendar-write');
    await updateICloudEvent(icloud, account, {
      eventId, sourceRef: sourceRefOf(input.sourceRef), etag: input.etag, scope, dayWas: input.dayWas, event, repeatChanged, timezone: ctx.timezone,
    });
    bumpCalendarRevision();
    return;
  }
  const { updateGoogleEvent } = await import('@/lib/google-calendar-write');
  await updateGoogleEvent({
    calendarId,
    eventId,
    etag: input.etag,
    scope,
    seriesId: typeof input.seriesId === 'string' ? input.seriesId : undefined,
    dayWas: input.dayWas,
    event,
    repeatChanged,
    timezone: ctx.timezone,
  });
  bumpCalendarRevision();
}

export async function removeEvent(request: NextRequest, id: string, input: { scope?: unknown; seriesId?: unknown; sourceRef?: unknown; etag?: unknown }): Promise<void> {
  const caller = await callerOf(request);
  const ctx = await writeContext();
  const { calendarId, eventId } = locateEvent(ctx, id);
  const source = await assertMayWrite(ctx, calendarId, caller);
  countWrite(request);
  if (source === 'icloud') {
    const { source: icloud, account } = await icloudTarget(ctx, calendarId);
    const { deleteICloudEvent } = await import('@/lib/icloud-calendar-write');
    await deleteICloudEvent(icloud, account, {
      eventId, sourceRef: sourceRefOf(input.sourceRef), scope: scopeOf(input.scope), timezone: ctx.timezone,
      ...(typeof input.etag === 'string' ? { etag: input.etag } : {}),
    });
    bumpCalendarRevision();
    return;
  }
  const { deleteGoogleEvent } = await import('@/lib/google-calendar-write');
  await deleteGoogleEvent({
    calendarId,
    eventId,
    scope: scopeOf(input.scope),
    seriesId: typeof input.seriesId === 'string' ? input.seriesId : undefined,
  });
  bumpCalendarRevision();
}

// ── What the forms offer ─────────────────────────────────────────────

export interface EntryCalendar {
  id: string;
  name: string;
  color: string;
  source: 'google' | 'icloud';
}

/** What the phone and the wall need to draw "Add event" and its form. */
export interface CalendarEntryInfo {
  /** The household turned adding on. */
  enabled: boolean;
  /** Where Google stands, for Settings and the phone's card; null on a hub with no Google calendars. */
  google: GoogleEntryState | null;
  /** Calendars a new event can go on now, in the household's order. Empty means no "Add event". */
  calendars: EntryCalendar[];
  defaultCalendarId: string | null;
  /** How long a new event lasts until changed, in minutes. */
  defaultMinutes: number;
  /** The household's clock, which every form works in. */
  timezone: string;
  /** The household's setting for the walls; each wall's own switch overrides it there. */
  wallDefault: boolean;
}

const DEFAULT_MINUTES = 60;

export async function calendarEntryInfo(): Promise<CalendarEntryInfo> {
  const ctx = await writeContext();
  const calendar = ctx.config.settings.calendar;
  const entry = calendar.eventEntry;
  const wallDefault = ctx.config.settings.calendarWallEntry !== false;
  const base = { enabled: Boolean(entry?.enabled), defaultMinutes: entry?.defaultMinutes ?? DEFAULT_MINUTES, timezone: ctx.timezone, wallDefault };
  const google = ctx.googleIds.length > 0
    ? await (await import('@/lib/google-auth')).getGoogleEntryState(base.enabled)
    : null;
  if (!base.enabled) return { ...base, google, calendars: [], defaultCalendarId: null };

  const googleEntry = ctx.entryIds.filter((id) => ctx.googleIds.includes(id));
  const labels = google === 'ready' && googleEntry.length > 0
    ? await (await import('@/lib/google-calendar')).googleCalendarLabels(googleEntry)
    : new Map<string, { name: string; color: string; writable: boolean }>();
  const icloud = new Map((calendar.icloudSources ?? []).map((s) => [s.id, s]));
  const looks = calendar.calendarOverrides;
  const calendars: EntryCalendar[] = [];
  for (const id of ctx.entryIds) {
    const label = labels.get(id);
    // Named and coloured as the household set them, the way the wall draws the events.
    if (label?.writable) calendars.push({ id, ...calendarLook(id, { name: label.name, color: label.color }, looks), source: 'google' });
    const source = icloud.get(id);
    if (source) calendars.push({ id, ...calendarLook(id, { name: source.name, color: source.color }, looks), source: 'icloud' });
  }
  const preferred = entry?.defaultCalendarId;
  const defaultCalendarId = calendars.find((c) => c.id === preferred)?.id ?? calendars[0]?.id ?? null;
  return { ...base, google, calendars, defaultCalendarId };
}
