import { expect, type APIRequestContext } from '@playwright/test';
import type { ScreenConfiguration } from '@/types/config';

export async function getConfig(request: APIRequestContext): Promise<ScreenConfiguration> {
  const res = await request.get('/api/config');
  expect(res.ok()).toBe(true);
  return res.json();
}

export async function putConfig(request: APIRequestContext, config: ScreenConfiguration): Promise<void> {
  const res = await request.put('/api/config', { data: config });
  expect(res.ok()).toBe(true);
}

/**
 * A member + a daily fixed-rotation chore assigned to them. A fixed daily chore
 * appears in "today"'s list regardless of the calendar date, so specs can assert
 * the chore name deterministically. Seeded via `PUT /api/chores/data`.
 */
export const CHORE_DATA = {
  members: [{ id: 'm1', name: 'Avery', emoji: '🦊', color: '#f59e0b' }],
  chores: [{
    id: 'c1',
    name: 'Feed the dog',
    emoji: '🐶',
    points: 1,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: 'anytime',
    assigneeIds: ['m1'],
    rotation: 'fixed',
  }],
};

export async function seedChores(request: APIRequestContext, data: unknown = CHORE_DATA): Promise<void> {
  const res = await request.put('/api/chores/data', { data });
  expect(res.ok()).toBe(true);
}

/** Local YYYY-MM-DD for a date offset from today, matching how the meal planner keys plan entries. */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One saved meal planned for today. The default week/today meal-planner views
 * filter the plan to the current week, so the plan date is stamped to "today"
 * at call time rather than a fixed string that would fall out of the window.
 * Seeded via `PUT /api/meals/data`.
 */
export function mealData() {
  return {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝', prepTime: 25 }],
    plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoDate(0) }],
  };
}

export async function seedMeals(request: APIRequestContext, data: unknown = mealData()): Promise<void> {
  const res = await request.put('/api/meals/data', { data });
  expect(res.ok()).toBe(true);
}

/**
 * A single calendar event spanning today, for stubbing `/api/calendar`. The
 * calendar views only surface events within a few days / the agenda window of
 * the test clock, so the date is stamped at call time rather than hardcoded.
 * Returns the bare `CalendarEvent[]` array the route serves.
 */
export function todayCalendarEvents() {
  const start = new Date();
  start.setHours(0, 1, 0, 0);
  const end = new Date();
  end.setDate(end.getDate() + 1);
  end.setHours(23, 59, 0, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
  return [{
    id: 'evt-1',
    title: 'Dentist Appointment',
    start: iso(start),
    end: iso(end),
    allDay: false,
    location: '123 Main St',
    calendarColor: '#4073ff',
    sourceId: 'cal-primary',
    sourceName: 'Personal',
  }];
}

/**
 * Simulate a display heartbeat by posting a status report the way a Pi kiosk
 * does. requireDisplayAuth is a no-op while auth is disabled, so no token is
 * needed. The remote control surface gates its screen-nav buttons on a live
 * heartbeat (screenCount > 0 and a non-null status), so a spec that clicks
 * "Next screen" must seed one first. With no `?display=` param and no body
 * displayId this lands in the legacy `__default__` slot the single-display
 * remote polls.
 */
export async function postHeartbeat(
  request: APIRequestContext,
  overrides: { screenCount?: number; currentIndex?: number; display?: string } = {},
): Promise<void> {
  const { screenCount = 2, currentIndex = 0, display } = overrides;
  // A specific `display` lands the heartbeat in that display's statusMap slot
  // (via ?display= and a matching body displayId); omit it for the legacy
  // __default__ slot the single-display remote polls.
  const url = display ? `/api/display/status?display=${encodeURIComponent(display)}` : '/api/display/status';
  const res = await request.post(url, {
    data: {
      ...(display ? { displayId: display } : {}),
      currentScreen: { index: currentIndex, id: `screen-${currentIndex}`, name: `Screen ${currentIndex}` },
      screenCount,
      activeProfile: null,
      displayState: 'active',
      timestamp: Date.now(),
    },
  });
  expect(res.ok()).toBe(true);
}
