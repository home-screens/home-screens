import { NextResponse, type NextRequest } from 'next/server';
import { updateConfigAtomic } from '@/lib/config';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import type { CalendarOverride } from '@/types/config';

export const dynamic = 'force-dynamic';

/** Only the form the wall's swatches produce, and the only one `<input type="color">` round-trips. */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** One legend row can stand for several calendars, so a tap may recolour more than one. */
const MAX_SOURCES = 32;

/**
 * Recolour a calendar from the wall.
 *
 * The full config write is session-only, and rightly so: a display token
 * should never be able to rewrite the layout. But recolouring a calendar is
 * the one appearance change worth making from the wall itself, because that
 * is where the clash is visible. So this route exists instead of relaxing
 * `PUT /api/config`: display auth, and the only thing it can reach is the
 * colour on an existing per-calendar override.
 *
 * Writes through `updateConfigAtomic`, which serialises against the editor
 * saving at the same moment. A straight read-modify-write would lose whichever
 * of the two landed first.
 */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ sourceIds?: unknown; color?: unknown }>(request);
  if (body instanceof NextResponse) return body;

  const { sourceIds, color } = body;
  if (typeof color !== 'string' || !HEX.test(color)) {
    return NextResponse.json({ error: 'Colour must be written as #rrggbb.' }, { status: 400 });
  }
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > MAX_SOURCES
      || !sourceIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: 'Name the calendars to recolour.' }, { status: 400 });
  }

  let missingCalendarSettings = false;
  await updateConfigAtomic((current) => {
    const calendar = current.settings.calendar;
    // Nothing to recolour on a display with no calendars configured, and
    // inventing a settings block here would mean guessing at its required
    // fields. Refused rather than half-written.
    if (!calendar) {
      missingCalendarSettings = true;
      return current;
    }

    const overrides: Record<string, CalendarOverride> = { ...(calendar.calendarOverrides ?? {}) };
    for (const id of sourceIds as string[]) {
      overrides[id] = { ...(overrides[id] ?? {}), color };
    }

    return {
      ...current,
      settings: { ...current.settings, calendar: { ...calendar, calendarOverrides: overrides } },
    };
  });

  if (missingCalendarSettings) {
    return NextResponse.json({ error: 'This display has no calendars set up.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, color, sourceIds });
}, 'Failed to set the calendar colour');
