import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { removeDayNote, updateDayNote } from '@/lib/day-notes';
import { dayNotesWrite } from '@/lib/day-notes-api';
import { asObject } from '@/lib/todo-api';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/day-notes/[id]: change a note's words, `{ text }`. Empty words remove it. Session only. */
export const PATCH = withAuth(async (request: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  const body = await parseJsonBody<{ text?: unknown }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const fields = asObject(body);
  if (fields instanceof NextResponse) return fields;
  return dayNotesWrite((data, today) => updateDayNote(data, id, fields.text, today));
}, 'Failed to save the day note');

/** DELETE /api/day-notes/[id]: remove a note. One already gone changes nothing. Session only. */
export const DELETE = withAuth(async (_request: NextRequest, ctx: RouteContext) => {
  const { id } = await ctx.params;
  return dayNotesWrite((data) => removeDayNote(data, id));
}, 'Failed to remove the day note');
