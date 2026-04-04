import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  enqueueCommand,
  drainCommands,
  getDisplayStatus,
  setDisplayStatus,
  type DisplayCommandType,
} from '@/lib/display-commands';
import { readConfig, writeConfig } from '@/lib/config';
import { requireSession } from '@/lib/auth';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** Commands that take no payload — just an action name. */
const SIMPLE_COMMANDS = new Set<DisplayCommandType>([
  'wake',
  'sleep',
  'next-screen',
  'prev-screen',
  'reload',
  'clear-alerts',
]);

type RouteContext = { params: Promise<{ action: string }> };

/**
 * GET handler — used for:
 * - /api/display/commands  → drain pending commands (display polls this)
 * - /api/display/status    → read last-known display status
 * - /api/display/wake (etc) → simple commands via GET (bookmarkable from phones)
 */
export const GET = withDisplayAuth<RouteContext>(async (_request, { params }) => {
  const { action } = await params;

  switch (action) {
    case 'commands': {
      const commands = drainCommands();
      return NextResponse.json({ commands });
    }
    case 'status': {
      const status = getDisplayStatus();
      if (!status) {
        return NextResponse.json({ error: 'No status reported yet' }, { status: 404 });
      }
      return NextResponse.json(status);
    }
    default:
      // Allow GET for simple commands (bookmarkable from phones)
      if (SIMPLE_COMMANDS.has(action as DisplayCommandType)) {
        enqueueCommand(action as DisplayCommandType);
        return NextResponse.json({ ok: true, command: action });
      }
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 });
  }
}, 'Display command failed');

/**
 * POST handler — used for all command types.
 * Simple commands need no body; brightness/profile/alert require JSON payloads.
 */
export const POST = withDisplayAuth<RouteContext>(async (request, { params }) => {
  const { action } = await params;

  // Simple commands (no body needed)
  if (SIMPLE_COMMANDS.has(action as DisplayCommandType)) {
    enqueueCommand(action as DisplayCommandType);
    return NextResponse.json({ ok: true, command: action });
  }

  switch (action) {
    case 'brightness': {
      const body = await safeJson(request);
      const value = typeof body?.value === 'number' ? body.value : null;
      if (value === null || value < 0 || value > 100) {
        return NextResponse.json(
          { error: 'value must be a number 0-100' },
          { status: 400 },
        );
      }
      enqueueCommand('brightness', { value });
      return NextResponse.json({ ok: true, command: 'brightness', value });
    }

    case 'profile': {
      try {
        await requireSession(request);
      } catch (error) {
        if (error instanceof Response) return error;
        return errorResponse(error, 'Unauthorized');
      }
      const body = await safeJson(request);
      const profile = body?.profile;
      if (typeof profile !== 'string') {
        return NextResponse.json(
          { error: 'profile must be a string' },
          { status: 400 },
        );
      }
      try {
        const config = await readConfig();
        if (profile && !config.profiles?.some((p) => p.id === profile)) {
          return NextResponse.json(
            { error: `Unknown profile: ${profile}` },
            { status: 404 },
          );
        }
        config.settings.activeProfile = profile || undefined;
        await writeConfig(config);
        return NextResponse.json({ ok: true, profile });
      } catch (error) {
        return errorResponse(error, 'Failed to update profile');
      }
    }

    case 'alert': {
      const body = await safeJson(request);
      if (!body?.title && !body?.message) {
        return NextResponse.json(
          { error: 'title or message required' },
          { status: 400 },
        );
      }
      const VALID_ALERT_TYPES = new Set(['info', 'warning', 'urgent']);
      const alertType = VALID_ALERT_TYPES.has(body.type as string) ? body.type : 'info';
      enqueueCommand('alert', {
        type: alertType,
        title: body.title ?? '',
        message: body.message ?? '',
        duration: body.duration,
        icon: body.icon,
        dismissible: body.dismissible,
      });
      return NextResponse.json({ ok: true, command: 'alert' });
    }

    case 'status': {
      const body = await safeJson(request);
      if (
        !body?.currentScreen ||
        typeof body.currentScreen !== 'object' ||
        typeof (body.currentScreen as Record<string, unknown>).id !== 'string' ||
        typeof body.displayState !== 'string' ||
        typeof body.timestamp !== 'number'
      ) {
        return NextResponse.json(
          { error: 'Invalid status: requires currentScreen, displayState, timestamp' },
          { status: 400 },
        );
      }
      setDisplayStatus(body as unknown as Parameters<typeof setDisplayStatus>[0]);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 404 },
      );
  }
}, 'Display command failed');

async function safeJson(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
