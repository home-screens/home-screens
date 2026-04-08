import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  enqueueCommand,
  drainCommands,
  getDisplayStatus,
  setDisplayStatus,
  recordViewportReport,
  type DisplayCommandType,
} from '@/lib/display-commands';
import { updateConfigAtomic } from '@/lib/config';
import { getDisplayProfiles } from '@/lib/display-filter';
import { requireSession } from '@/lib/auth';
import { errorResponse, withDisplayAuth, getClientIP } from '@/lib/api-utils';

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

/** URL-safe slug rule — kept in lockstep with display-filter.ts and display-commands.ts. */
const DISPLAY_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Validate a target string. Returns the value or a 400 NextResponse. */
function validateDisplayTarget(
  value: string | null | undefined,
  { allowBroadcast }: { allowBroadcast: boolean },
): string | undefined | NextResponse {
  if (value == null || value.length === 0) return undefined;
  if (value === 'all') {
    // The literal "all" is only meaningful as a broadcast keyword in
    // enqueue paths. Read-only and mutation actions must reject it rather
    // than treat it as a normal slug — otherwise "all" becomes a ghost
    // key in knownDisplays / statusMap, and future broadcasts push commands
    // to a queue nobody ever drains.
    if (allowBroadcast) return 'all';
    return NextResponse.json(
      { error: '"all" is only valid for broadcast-capable command actions' },
      { status: 400 },
    );
  }
  if (value.length > 64 || !DISPLAY_ID_RE.test(value)) {
    return NextResponse.json(
      { error: `Invalid display id "${value}": must be lowercase letters, digits, hyphens (e.g. kitchen, bedroom-tv)` },
      { status: 400 },
    );
  }
  return value;
}

/** Pull the optional `?display=<id>` query parameter (or `?display=all` for broadcast). */
function getDisplayIdFromQuery(
  request: NextRequest,
  opts: { allowBroadcast: boolean },
): string | undefined | NextResponse {
  return validateDisplayTarget(request.nextUrl.searchParams.get('display'), opts);
}

/**
 * GET handler — used for:
 * - /api/display/commands?display=<id>  → drain that display's queue
 * - /api/display/status?display=<id>    → read last-known status (per display)
 * - /api/display/wake?display=<id>      → simple commands via GET (bookmarkable)
 * - /api/display/wake?display=all       → broadcast simple command to all displays
 */
export const GET = withDisplayAuth<RouteContext>(async (request, { params }) => {
  const { action } = await params;

  // Drain and status are read-only and have no broadcast meaning. Simple
  // commands and broadcast (`?display=all`) are only valid through the
  // command-enqueue path below.
  const isCommandAction =
    action !== 'commands' && action !== 'status' && SIMPLE_COMMANDS.has(action as DisplayCommandType);
  const validated = getDisplayIdFromQuery(request, { allowBroadcast: isCommandAction });
  if (validated instanceof NextResponse) return validated;
  const displayId = validated;

  switch (action) {
    case 'commands': {
      const commands = drainCommands(displayId);
      return NextResponse.json({ commands });
    }
    case 'status': {
      const status = getDisplayStatus(displayId);
      if (!status) {
        return NextResponse.json({ error: 'No status reported yet' }, { status: 404 });
      }
      return NextResponse.json(status);
    }
    default:
      // Allow GET for simple commands (bookmarkable from phones)
      if (SIMPLE_COMMANDS.has(action as DisplayCommandType)) {
        enqueueCommand(displayId, action as DisplayCommandType);
        return NextResponse.json({ ok: true, command: action });
      }
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 404 });
  }
}, 'Display command failed');

/**
 * POST handler — used for all command types.
 * Simple commands need no body; brightness/profile/alert require JSON payloads.
 *
 * The optional `displayId` field on the body targets a specific display.
 * Falling back to the query string lets simple URL-based clients
 * (Home Assistant, curl) target displays without needing a JSON body.
 */
export const POST = withDisplayAuth<RouteContext>(async (request, { params }) => {
  const { action } = await params;

  // Broadcast is allowed for command-enqueue actions (simple commands, brightness,
  // alert) and disallowed for read-only or mutate-config actions (status, profile).
  const isMutationAction = action === 'profile' || action === 'status';
  const validated = getDisplayIdFromQuery(request, { allowBroadcast: !isMutationAction });
  if (validated instanceof NextResponse) return validated;
  const queryDisplayId = validated;

  // Simple commands (no body needed)
  if (SIMPLE_COMMANDS.has(action as DisplayCommandType)) {
    enqueueCommand(queryDisplayId, action as DisplayCommandType);
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
      const displayId = pickDisplayId(body, queryDisplayId, { allowBroadcast: true });
      if (displayId instanceof NextResponse) return displayId;
      enqueueCommand(displayId, 'brightness', { value });
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
      const displayIdRaw = pickDisplayId(body, queryDisplayId, { allowBroadcast: false });
      if (displayIdRaw instanceof NextResponse) return displayIdRaw;
      const displayId = displayIdRaw;
      try {
        // Atomic read-modify-write — without this the editor's PUT /api/config
        // can land between our read and write and lose unrelated edits.
        // The mutator throws a Response for validation errors, which propagates
        // out of updateConfigAtomic for us to return directly.
        await updateConfigAtomic((config) => {
          // Per-display profile: write display.activeProfile on the matching node.
          // Legacy mode (no displayId or 'all'): mutate settings.activeProfile.
          if (displayId && displayId !== 'all') {
            const display = config.displays?.find((d) => d.id === displayId);
            if (!display) {
              throw NextResponse.json(
                { error: `Unknown display: ${displayId}` },
                { status: 404 },
              );
            }
            // Resolve the effective profile pool for this display:
            //   - owned profiles (display.profiles), OR
            //   - global pool filtered by display.profileIds, OR
            //   - the unrestricted global pool
            // `getDisplayProfiles` implements that precedence in one place —
            // using the raw `display.profiles ?? config.profiles` fallback
            // silently accepts profiles excluded by `profileIds`, which
            // would then fail `validateDisplays` on the next save.
            if (profile) {
              const pool = getDisplayProfiles(display, config.profiles);
              if (!pool.some((p) => p.id === profile)) {
                throw NextResponse.json(
                  { error: `Unknown profile: ${profile}` },
                  { status: 404 },
                );
              }
            }
            display.activeProfile = profile || undefined;
          } else {
            if (profile && !config.profiles?.some((p) => p.id === profile)) {
              throw NextResponse.json(
                { error: `Unknown profile: ${profile}` },
                { status: 404 },
              );
            }
            config.settings.activeProfile = profile || undefined;
          }
          return config;
        });
        return NextResponse.json({ ok: true, profile, displayId });
      } catch (error) {
        if (error instanceof Response) return error;
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
      const displayId = pickDisplayId(body, queryDisplayId, { allowBroadcast: true });
      if (displayId instanceof NextResponse) return displayId;
      enqueueCommand(displayId, 'alert', {
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
      // Strip displayId and clientId out of the persisted status so the
      // body shape stays the same as before (the in-memory keying is
      // handled by setDisplayStatus / recordViewportReport).
      const {
        displayId: bodyDisplayId,
        clientId: bodyClientId,
        ...statusPayload
      } = body as Record<string, unknown>;
      const rawDisplayId =
        typeof bodyDisplayId === 'string' ? bodyDisplayId : queryDisplayId;
      // Validate the body field too — `pickDisplayId` only validates the body
      // when `validateDisplayTarget` is invoked, so do it here for status reports.
      const validatedStatus = validateDisplayTarget(rawDisplayId, { allowBroadcast: false });
      if (validatedStatus instanceof NextResponse) return validatedStatus;
      setDisplayStatus(
        statusPayload as unknown as Parameters<typeof setDisplayStatus>[0],
        validatedStatus,
      );

      // Track viewport per-client so the editor can surface "N things are
      // reporting with this display ID" instead of silently flapping between
      // whichever client POSTed most recently. We also stash the source IP
      // so the user can trace a phantom reporter back to its device on the
      // LAN (critical when the Pi they *think* is posting is actually off).
      const viewport = (body as { reportedViewport?: unknown }).reportedViewport;
      if (
        validatedStatus
        && typeof bodyClientId === 'string'
        && bodyClientId.length > 0
        && viewport
        && typeof viewport === 'object'
      ) {
        const v = viewport as { width?: unknown; height?: unknown };
        if (typeof v.width === 'number' && typeof v.height === 'number') {
          recordViewportReport(
            validatedStatus,
            bodyClientId,
            v.width,
            v.height,
            getClientIP(request),
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 404 },
      );
  }
}, 'Display command failed');

/**
 * Body field overrides query string when both are provided. Returns the
 * validated value, or a 400 NextResponse on a slug violation.
 */
function pickDisplayId(
  body: Record<string, unknown> | null,
  fallback: string | undefined,
  opts: { allowBroadcast: boolean },
): string | undefined | NextResponse {
  const fromBody = body?.displayId;
  if (typeof fromBody === 'string' && fromBody.length > 0) {
    return validateDisplayTarget(fromBody, opts);
  }
  return fallback;
}

async function safeJson(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
