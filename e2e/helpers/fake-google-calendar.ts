import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A small Google Calendar for E2E and for hand-testing in a sandbox hub: the
 * hub calls Google from the server, so the browser-boundary stubs cannot
 * stand in for it. The hub talks to it through `HS_GOOGLE_CALENDAR_API_URL`.
 * Answers the slice of Calendar API v3 Home Screens uses (calendar list,
 * colors, calendars.get, events list/get/insert/patch/delete) from an
 * in-memory household, with etags that change on every write and `If-Match`
 * checked, so "someone changed it elsewhere" can be tested. Repeating events
 * are expanded for `singleEvents=true` the way Google does: one day of a
 * series is `<seriesId>_<YYYYMMDD>`, an all-day or timed day alike, with
 * `recurringEventId` set. Times are naive local times with `timeZone`, which
 * the hub reads on the household's clock.
 *
 * A patch merges `start` and `end` field by field, as Google documents for
 * `events.patch`: a field left out keeps its value and `null` clears it. An
 * event left with both a `date` and a `dateTime` is answered 400, so a change
 * between all day and timed that forgets to clear the old shape fails here.
 */

export interface FakeCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  accessRole: 'owner' | 'writer' | 'reader';
  primary?: boolean;
}

interface Stored {
  id: string;
  etag: string;
  summary: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  extendedProperties?: unknown;
  /** A colour of its own from Google's legacy palette (see `eventColors`). */
  colorId?: string;
  /** One day of a series changed on its own: original day to the event as changed. */
  overrides: Record<string, Stored>;
  /** Days of a series removed on their own. */
  skipped: string[];
}

export interface FakeGoogleCalendar {
  url: string;
  calendars: FakeCalendar[];
  /** Every request seen, for assertions: method, path and the body sent. */
  calls: { method: string; path: string; body: unknown }[];
  /** Add an event straight into a calendar, as if made in Google Calendar. Answers its id. */
  seed(calendarId: string, event: Omit<Stored, 'id' | 'etag' | 'overrides' | 'skipped'>): string;
  /** Change an event behind the hub's back, so its etag moves. */
  touch(calendarId: string, eventId: string, patch: Partial<Stored>): void;
  reset(): void;
  close(): Promise<void>;
}

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/**
 * The days a series falls on between two days, from its RRULE: the six
 * frequencies Home Screens writes, each anchored to one day (`BYDAY=WE`,
 * `BYMONTHDAY=22`, `BYMONTH=11;BYMONTHDAY=22`) or bare. As RFC 5545 reads
 * it, the first day always counts, then every day the rule names.
 */
function seriesDays(first: string, rrule: string, from: string, to: string, skipped: string[]): string[] {
  const fields = new Map(rrule.replace(/^RRULE:/, '').split(';').map((p) => p.split('=') as [string, string]));
  const freq = fields.get('FREQ');
  const step = Number(fields.get('INTERVAL') ?? 1);
  const untilRaw = fields.get('UNTIL');
  const until = untilRaw ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}` : '9999-12-31';
  const byDay = fields.get('BYDAY');
  const weekdaysOnly = byDay === 'MO,TU,WE,TH,FR';
  const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const f = new Date(dayMs(first));
  const weekday = byDay && !weekdaysOnly ? CODES.indexOf(byDay) : f.getUTCDay();
  const monthDay = Number(fields.get('BYMONTHDAY') ?? f.getUTCDate());
  const month = Number(fields.get('BYMONTH') ?? f.getUTCMonth() + 1);
  // Weeks count from the Monday of the first day's week (RFC 5545's default WKST).
  const firstMonday = dayMs(first) - ((f.getUTCDay() + 6) % 7) * DAY_MS;
  const named = (day: string): boolean => {
    const d = new Date(dayMs(day));
    if (freq === 'DAILY') return ((dayMs(day) - dayMs(first)) / DAY_MS) % step === 0;
    if (weekdaysOnly) return d.getUTCDay() > 0 && d.getUTCDay() < 6;
    if (freq === 'WEEKLY') return d.getUTCDay() === weekday && Math.floor((dayMs(day) - firstMonday) / (7 * DAY_MS)) % step === 0;
    if (freq === 'MONTHLY') return d.getUTCDate() === monthDay;
    if (freq === 'YEARLY') return d.getUTCMonth() + 1 === month && d.getUTCDate() === monthDay;
    return false;
  };
  const out: string[] = [];
  for (let i = 0, day = first; day <= to && day <= until && i < 4000; i++, day = isoDay(dayMs(day) + DAY_MS)) {
    if (day >= from && !skipped.includes(day) && (day === first || named(day))) out.push(day);
  }
  return out;
}

function shiftTo(time: Stored['start'], day: string, firstDay: string): Stored['start'] {
  const offset = (dayMs(day) - dayMs(firstDay)) / DAY_MS;
  if (time.date) return { date: isoDay(dayMs(time.date) + offset * DAY_MS) };
  const date = time.dateTime!.slice(0, 10);
  return { dateTime: `${isoDay(dayMs(date) + offset * DAY_MS)}${time.dateTime!.slice(10)}`, timeZone: time.timeZone };
}

const firstDayOf = (e: Stored) => (e.start.date ?? e.start.dateTime!.slice(0, 10));

type When = Stored['start'];

/** A start or end with a patch laid over it: named fields replace, `null` clears, the rest stay. */
function mergeWhen(current: When | undefined, patch: unknown): When {
  const merged: Record<string, unknown> = { ...current, ...(patch && typeof patch === 'object' ? patch : {}) };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== null && value !== undefined)) as When;
}

/** An event with a patch body laid over it, `start` and `end` merged rather than replaced. */
function patched(event: Stored, body: Record<string, unknown> | undefined): Stored {
  return {
    ...event,
    ...body,
    start: mergeWhen(event.start, body?.start),
    end: mergeWhen(event.end, body?.end),
  } as Stored;
}

/** Google refuses a start or end that is both a day and a time, or neither. */
function badTimes(event: Pick<Stored, 'start' | 'end'>): boolean {
  return [event.start, event.end].some((when) => Boolean(when.date) === Boolean(when.dateTime));
}

const BAD_TIMES = { error: { code: 400, message: 'Invalid start time.', errors: [{ reason: 'invalid' }] } };

function publicEvent(e: Stored, extra: Record<string, unknown> = {}) {
  const { overrides: _o, skipped: _s, ...rest } = e;
  return { ...rest, ...extra };
}

/**
 * `eventColors` is Google's legacy event palette (`colorId` to colour), for
 * events seeded with a `colorId` of their own.
 */
export async function startFakeGoogleCalendar(
  calendars: FakeCalendar[],
  { eventColors = {} }: { eventColors?: Record<string, string> } = {},
): Promise<FakeGoogleCalendar> {
  let counter = 0;
  const events = new Map<string, Map<string, Stored>>();
  const calls: FakeGoogleCalendar['calls'] = [];
  const nextEtag = () => `"e${++counter}"`;
  const bucket = (calendarId: string) => {
    if (!events.has(calendarId)) events.set(calendarId, new Map());
    return events.get(calendarId)!;
  };

  /** The days of every event in a window, series expanded. */
  function list(calendarId: string, from: string, to: string) {
    const items: unknown[] = [];
    for (const e of bucket(calendarId).values()) {
      const rrule = e.recurrence?.find((l) => l.startsWith('RRULE:'));
      if (!rrule) {
        if (firstDayOf(e) <= to) items.push(publicEvent(e));
        continue;
      }
      for (const day of seriesDays(firstDayOf(e), rrule, from, to, e.skipped)) {
        const instanceId = `${e.id}_${day.replace(/-/g, '')}`;
        const changed = e.overrides[day];
        items.push(changed
          ? publicEvent(changed, { id: instanceId, recurringEventId: e.id })
          : publicEvent(e, { id: instanceId, recurringEventId: e.id, recurrence: undefined, start: shiftTo(e.start, day, firstDayOf(e)), end: shiftTo(e.end, day, firstDayOf(e)), etag: `${e.etag.slice(0, -1)}-${day}"` }));
      }
    }
    return items;
  }

  /** An event or one day of a series, by the id the hub has. */
  function find(calendarId: string, eventId: string): { series?: Stored; day?: string; event: Stored | null } {
    const direct = bucket(calendarId).get(eventId);
    if (direct) return { event: direct };
    const m = /^(.+)_(\d{4})(\d{2})(\d{2})$/.exec(eventId);
    if (!m) return { event: null };
    const series = bucket(calendarId).get(m[1]);
    const day = `${m[2]}-${m[3]}-${m[4]}`;
    if (!series || series.skipped.includes(day)) return { event: null };
    const instance = series.overrides[day] ?? {
      ...series, id: eventId, recurrence: undefined, overrides: {}, skipped: [],
      start: shiftTo(series.start, day, firstDayOf(series)), end: shiftTo(series.end, day, firstDayOf(series)),
      etag: `${series.etag.slice(0, -1)}-${day}"`,
    };
    return { series, day, event: instance };
  }

  const send = (res: http.ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : undefined;
    const path = decodeURIComponent(url.pathname);
    calls.push({ method: req.method ?? 'GET', path, body });
    const ifMatch = req.headers['if-match'];

    if (path === '/calendar/v3/users/me/calendarList') return send(res, 200, { items: calendars });
    if (path === '/calendar/v3/colors') {
      return send(res, 200, { event: Object.fromEntries(Object.entries(eventColors).map(([id, background]) => [id, { background }])) });
    }
    let m = /^\/calendar\/v3\/calendars\/([^/]+)$/.exec(path);
    if (m) return send(res, 200, { id: m[1], labelProperties: {} });

    m = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/.exec(path);
    if (m) {
      const calendarId = m[1];
      if (req.method === 'POST') {
        const id = `ev${++counter}`;
        const stored: Stored = { ...body, start: mergeWhen(undefined, body?.start), end: mergeWhen(undefined, body?.end), id, etag: nextEtag(), overrides: {}, skipped: [] };
        if (badTimes(stored)) return send(res, 400, BAD_TIMES);
        bucket(calendarId).set(id, stored);
        return send(res, 200, publicEvent(stored));
      }
      const from = (url.searchParams.get('timeMin') ?? '1970-01-01').slice(0, 10);
      const to = (url.searchParams.get('timeMax') ?? '9999-12-31').slice(0, 10);
      return send(res, 200, { items: list(calendarId, from, to) });
    }

    m = /^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/.exec(path);
    if (m) {
      const [, calendarId, eventId] = m;
      const role = calendars.find((c) => c.id === calendarId)?.accessRole;
      const { series, day, event } = find(calendarId, eventId);
      if (req.method === 'GET') return event ? send(res, 200, publicEvent(event, series ? { recurringEventId: series.id } : {})) : send(res, 404, { error: { code: 404 } });
      if (role === 'reader') return send(res, 403, { error: { code: 403 } });
      if (!event) return send(res, req.method === 'DELETE' ? 410 : 404, { error: { code: 404 } });
      if (ifMatch && ifMatch !== event.etag) return send(res, 412, { error: { code: 412 } });
      if (req.method === 'DELETE') {
        if (series && day) {
          series.skipped.push(day);
          delete series.overrides[day];
          series.etag = nextEtag();
        } else bucket(calendarId).delete(eventId);
        return send(res, 204);
      }
      if (req.method === 'PATCH') {
        const next = patched(event, body);
        if (badTimes(next)) return send(res, 400, BAD_TIMES);
        if (series && day) {
          const changed: Stored = { ...next, id: eventId, recurrence: undefined, overrides: {}, skipped: [], etag: nextEtag() };
          series.overrides[day] = changed;
          return send(res, 200, publicEvent(changed));
        }
        Object.assign(event, next, { etag: nextEtag() });
        return send(res, 200, publicEvent(event));
      }
    }
    send(res, 404, { error: { code: 404, message: `fake Google has no ${req.method} ${path}` } });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    calendars,
    calls,
    seed(calendarId, event) {
      const id = `seed${++counter}`;
      bucket(calendarId).set(id, { ...event, id, etag: nextEtag(), overrides: {}, skipped: [] });
      return id;
    },
    touch(calendarId, eventId, patch) {
      const stored = bucket(calendarId).get(eventId);
      if (stored) Object.assign(stored, patch, { etag: nextEtag() });
    },
    reset() {
      events.clear();
      calls.length = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
