import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  enqueueCommand,
  drainCommands,
  getDisplayStatus,
  setDisplayStatus,
  recordViewportReport,
  recordSharedStateReport,
  getSharedStateReport,
  recordProviderHealthReport,
  getProviderHealthReport,
  markSharedStateInterest,
  hasSharedStateInterest,
  type DisplayCommandType,
} from '@/lib/display-commands';
import { updateConfigAtomic } from '@/lib/config';
import { getDisplayProfiles, isValidDisplayId } from '@/lib/display-filter';
import { errorResponse, withDisplayAuth, getClientIP } from '@/lib/api-utils';
import { validateBrowserStats } from '@/lib/hardware-stats';

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
  if (!isValidDisplayId(value)) {
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
 * - /api/display/commands?display=<id>      → drain that display's queue
 * - /api/display/status?display=<id>        → read last-known status (per display)
 * - /api/display/shared-state?display=<id>  → read last-reported shared-state snapshot
 * - /api/display/wake?display=<id>          → simple commands via GET (bookmarkable)
 * - /api/display/wake?display=all           → broadcast simple command to all displays
 */
export const GET = withDisplayAuth<RouteContext>(async (request, { params }) => {
  const { action } = await params;

  // Drain, status, and shared-state are read-only and have no broadcast
  // meaning. Simple commands and broadcast (`?display=all`) are only valid
  // through the command-enqueue path below.
  const isCommandAction = SIMPLE_COMMANDS.has(action as DisplayCommandType);
  const validated = getDisplayIdFromQuery(request, { allowBroadcast: isCommandAction });
  if (validated instanceof NextResponse) return validated;
  const displayId = validated;

  switch (action) {
    case 'commands': {
      const commands = drainCommands(displayId);
      // `sharedStateWatched` tells the display whether an editor is
      // currently polling its shared-state snapshot — only then does the
      // client arm its fast bus-change status re-reporting.
      return NextResponse.json({
        commands,
        sharedStateWatched: hasSharedStateInterest(displayId),
      });
    }
    case 'status': {
      const status = getDisplayStatus(displayId);
      if (!status) {
        return NextResponse.json({ error: 'No status reported yet' }, { status: 404 });
      }
      return NextResponse.json(status);
    }
    case 'shared-state': {
      // Empty response (not a 404) when nothing has reported — the editor
      // polls this while a condition panel is open and "no snapshot yet" is
      // an expected state, not an error. The poll doubles as the editor's
      // interest signal: it arms the display's fast bus-change re-reporting
      // via the `sharedStateWatched` flag on the commands drain above.
      markSharedStateInterest(displayId);
      const report = getSharedStateReport(displayId);
      const base = report ?? { entries: {}, reportedAt: null };
      // `providerHealth` rides the same response — only unhealthy plugins,
      // and the field is omitted while empty (same convention as the snapshot).
      const health = getProviderHealthReport(displayId);
      return NextResponse.json(
        health && Object.keys(health.health).length > 0
          ? { ...base, providerHealth: health.health }
          : base,
      );
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
 * Simple commands need no body; brightness/goto-screen/profile/alert require JSON payloads.
 *
 * The optional `displayId` field on the body targets a specific display.
 * Falling back to the query string lets simple URL-based clients
 * (Home Assistant, curl) target displays without needing a JSON body.
 *
 * Each action dispatches to a focused handler below so the branch bodies
 * can be read (and tested) without the surrounding switch noise. The
 * dispatch itself is intentionally tiny.
 */
export const POST = withDisplayAuth<RouteContext>(async (request, { params }) => {
  const { action } = await params;

  // Broadcast is allowed for command-enqueue actions (simple commands, brightness,
  // alert) and disallowed for read-only or mutate-config actions (status, profile).
  // goto-screen is an enqueue action but still excluded: screen sets differ per
  // display, so a name/id target has no meaning fanned out to every display.
  const noBroadcast = action === 'profile' || action === 'status' || action === 'goto-screen';
  const validated = getDisplayIdFromQuery(request, { allowBroadcast: !noBroadcast });
  if (validated instanceof NextResponse) return validated;
  const queryDisplayId = validated;

  // Simple commands (no body needed)
  if (SIMPLE_COMMANDS.has(action as DisplayCommandType)) {
    enqueueCommand(queryDisplayId, action as DisplayCommandType);
    return NextResponse.json({ ok: true, command: action });
  }

  switch (action) {
    case 'brightness':
      return handleBrightness(request, queryDisplayId);
    case 'goto-screen':
      return handleGotoScreen(request, queryDisplayId);
    case 'profile':
      return handleProfile(request, queryDisplayId);
    case 'alert':
      return handleAlert(request, queryDisplayId);
    case 'status':
      return handleStatus(request, queryDisplayId);
    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 404 },
      );
  }
}, 'Display command failed');

async function handleBrightness(
  request: NextRequest,
  queryDisplayId: string | undefined,
): Promise<NextResponse> {
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

/**
 * The queue payload carries the raw target string; the display client resolves
 * it against its own screen list (id first, then case-insensitive name — see
 * resolveScreenTargetIndex). The hub can't validate the target here because
 * screen sets are per-display and the queue layer deliberately never reads
 * config. The length cap only bounds queue memory — real screen names and ids
 * are far shorter.
 */
const MAX_GOTO_TARGET_LENGTH = 256;

async function handleGotoScreen(
  request: NextRequest,
  queryDisplayId: string | undefined,
): Promise<NextResponse> {
  const body = await safeJson(request);
  const screen = typeof body?.screen === 'string' ? body.screen.trim() : '';
  if (screen.length === 0 || screen.length > MAX_GOTO_TARGET_LENGTH) {
    return NextResponse.json(
      { error: 'screen must be a screen id or name (non-empty string)' },
      { status: 400 },
    );
  }
  const displayId = pickDisplayId(body, queryDisplayId, { allowBroadcast: false });
  if (displayId instanceof NextResponse) return displayId;
  enqueueCommand(displayId, 'goto-screen', { screen });
  return NextResponse.json({ ok: true, command: 'goto-screen', screen });
}

/**
 * No extra session gate beyond the route's `withDisplayAuth` wrapper: display-
 * token callers (Home Assistant, curl) may switch profiles, same as the other
 * command verbs. Profile switching writes config, but only the `activeProfile`
 * pointer — the same value the display's own rules engine flips — so the
 * display-token trust level is appropriate.
 */
async function handleProfile(
  request: NextRequest,
  queryDisplayId: string | undefined,
): Promise<Response> {
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
    //
    // Validation errors are captured into `validationError` and returned
    // outside the mutator. The mutator returns the original `config`
    // reference unchanged on validation failure; `updateConfigAtomic`
    // detects the no-op (mutated === current) and skips the disk write,
    // so failed validations don't trigger spurious serialize+fsync work
    // or extend the critical section. The happy path returns a NEW
    // config object (immutable update) so the reference comparison
    // correctly identifies it as a real write.
    let validationError: NextResponse | null = null;
    await updateConfigAtomic((config) => {
      // Per-display profile: write display.activeProfile on the matching node.
      // Legacy single-display mode (no displayId): mutate settings.activeProfile.
      // Broadcast ('all') is rejected upstream via allowBroadcast: false, so
      // displayId is either a specific slug or undefined here.
      if (displayId) {
        const display = config.displays?.find((d) => d.id === displayId);
        if (!display) {
          validationError = NextResponse.json(
            { error: `Unknown display: ${displayId}` },
            { status: 404 },
          );
          return config;
        }
        // Resolve the effective profile pool for this display:
        //   - owned profiles (display.profiles), OR
        //   - the unrestricted global pool
        // `getDisplayProfiles` implements that precedence in one place.
        if (profile) {
          const pool = getDisplayProfiles(display, config.profiles);
          if (!pool.some((p) => p.id === profile)) {
            validationError = NextResponse.json(
              { error: `Unknown profile: ${profile}` },
              { status: 404 },
            );
            return config;
          }
        }
        const updatedDisplay = { ...display, activeProfile: profile || undefined };
        return {
          ...config,
          displays: config.displays!.map((d) => (d.id === displayId ? updatedDisplay : d)),
        };
      }
      if (profile && !config.profiles?.some((p) => p.id === profile)) {
        validationError = NextResponse.json(
          { error: `Unknown profile: ${profile}` },
          { status: 404 },
        );
        return config;
      }
      return {
        ...config,
        settings: { ...config.settings, activeProfile: profile || undefined },
      };
    });
    if (validationError) return validationError;
    return NextResponse.json({ ok: true, profile, displayId });
  } catch (error) {
    return errorResponse(error, 'Failed to update profile');
  }
}

async function handleAlert(
  request: NextRequest,
  queryDisplayId: string | undefined,
): Promise<NextResponse> {
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

/** Validated + destructured status heartbeat, ready to apply. */
interface ParsedStatusReport {
  /** Body with the transport-only fields stripped; the persisted status shape. */
  statusPayload: Record<string, unknown>;
  bodyClientId: unknown;
  bodySharedState: unknown;
  bodyProviderHealth: unknown;
  browserStats: ReturnType<typeof validateBrowserStats> | undefined;
  validatedDisplayId: string | undefined;
}

/**
 * Validate the status heartbeat body and resolve the target display id.
 * Returns a 400/validation NextResponse on failure, otherwise the parsed
 * pieces the handler needs.
 *
 * The check order is load-bearing — the body-shape check, displayState enum,
 * displayId slug, and browserStats each own a distinct 400 and must fire in
 * this sequence.
 */
function parseStatusReport(
  body: Record<string, unknown> | null,
  queryDisplayId: string | undefined,
): ParsedStatusReport | NextResponse {
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
  // Gate displayState on the documented enum — the store has several
  // consumers (editor UI, StatsSection dot color) that branch on the
  // literal values, and a future or misbehaving client sending garbage
  // would silently render as "asleep" (the fallback color) forever.
  if (body.displayState !== 'active' && body.displayState !== 'dimmed' && body.displayState !== 'asleep') {
    return NextResponse.json(
      { error: 'displayState must be one of: active, dimmed, asleep' },
      { status: 400 },
    );
  }
  // Strip displayId and clientId out of the persisted status so the
  // body shape stays the same as before (the in-memory keying is
  // handled by setDisplayStatus / recordViewportReport).
  //
  // hwStats is no longer accepted on this endpoint — reporters post to
  // `/api/display/hw-stats` (adoption-gated, no display auth). Any `hwStats`
  // field in a browser-heartbeat body is silently dropped here to keep old
  // client builds safe if they straggle an upgrade.
  // `sharedState` is likewise stripped — it goes into its own in-memory
  // store (recordSharedStateReport) so the status body shape is unchanged.
  // `providerHealth` rides the same way into recordProviderHealthReport.
  const {
    displayId: bodyDisplayId,
    clientId: bodyClientId,
    hwStats: _droppedHwStats,
    browserStats: bodyBrowserStats,
    sharedState: bodySharedState,
    providerHealth: bodyProviderHealth,
    ...statusPayload
  } = body as Record<string, unknown>;
  void _droppedHwStats;
  const rawDisplayId =
    typeof bodyDisplayId === 'string' ? bodyDisplayId : queryDisplayId;
  // Validate the body field too — `pickDisplayId` only validates the body
  // when `validateDisplayTarget` is invoked, so do it here for status reports.
  const validatedDisplayId = validateDisplayTarget(rawDisplayId, { allowBroadcast: false });
  if (validatedDisplayId instanceof NextResponse) return validatedDisplayId;

  let browserStats: ReturnType<typeof validateBrowserStats> | undefined;
  if (bodyBrowserStats !== undefined) {
    const parsed = validateBrowserStats(bodyBrowserStats);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid browserStats' }, { status: 400 });
    }
    browserStats = parsed;
  }

  return { statusPayload, bodyClientId, bodySharedState, bodyProviderHealth, browserStats, validatedDisplayId };
}

/**
 * Push the heartbeat into the in-memory statusMap. Synthesizes a top-level
 * `reportedViewport` from browserStats so downstream consumers
 * (/api/displays, editor panels, tests) keep reading from a single field
 * even though the client now sends the data only inside browserStats.
 */
function applyStatusHeartbeat(parsed: ParsedStatusReport): void {
  const { statusPayload, browserStats, validatedDisplayId } = parsed;
  const synthesizedViewport =
    browserStats &&
    typeof browserStats.viewportWidth === 'number' &&
    typeof browserStats.viewportHeight === 'number'
      ? { width: browserStats.viewportWidth, height: browserStats.viewportHeight }
      : undefined;

  setDisplayStatus(
    {
      ...statusPayload,
      ...(browserStats ? { browserStats } : {}),
      ...(synthesizedViewport ? { reportedViewport: synthesizedViewport } : {}),
    } as unknown as Parameters<typeof setDisplayStatus>[0],
    validatedDisplayId,
  );
}

/**
 * Record the per-client viewport report so the editor can surface "N things
 * are reporting with this display ID" instead of silently flapping between
 * whichever client POSTed most recently. Also stashes the source IP so the
 * user can trace a phantom reporter back to its device on the LAN (critical
 * when the Pi they *think* is posting is actually off).
 *
 * The viewport is carried inside `browserStats` on the wire (the client
 * stopped sending a separate `reportedViewport` field to avoid on-wire
 * duplication). We still accept a top-level `reportedViewport` as a legacy
 * fallback so older display clients keep working through an upgrade window.
 */
function recordStatusViewport(
  request: NextRequest,
  body: Record<string, unknown> | null,
  parsed: ParsedStatusReport,
): void {
  const { browserStats, bodyClientId, validatedDisplayId } = parsed;
  let viewportWidth: number | undefined;
  let viewportHeight: number | undefined;
  if (browserStats) {
    viewportWidth = browserStats.viewportWidth;
    viewportHeight = browserStats.viewportHeight;
  } else {
    const legacy = (body as { reportedViewport?: unknown } | null)?.reportedViewport;
    if (legacy && typeof legacy === 'object') {
      const v = legacy as { width?: unknown; height?: unknown };
      if (typeof v.width === 'number' && typeof v.height === 'number') {
        viewportWidth = v.width;
        viewportHeight = v.height;
      }
    }
  }
  if (
    validatedDisplayId
    && typeof bodyClientId === 'string'
    && bodyClientId.length > 0
    && typeof viewportWidth === 'number'
    && typeof viewportHeight === 'number'
  ) {
    recordViewportReport(
      validatedDisplayId,
      bodyClientId,
      viewportWidth,
      viewportHeight,
      getClientIP(request),
    );
  }
}

async function handleStatus(
  request: NextRequest,
  queryDisplayId: string | undefined,
): Promise<NextResponse> {
  const body = await safeJson(request);
  const parsed = parseStatusReport(body, queryDisplayId);
  if (parsed instanceof NextResponse) return parsed;

  applyStatusHeartbeat(parsed);

  // Shared-state bus snapshot piggybacking on the heartbeat — stored per
  // display so the editor can show live values next to condition inputs.
  if (parsed.bodySharedState !== undefined) {
    recordSharedStateReport(parsed.validatedDisplayId, parsed.bodySharedState);
  }
  // Provider-health snapshot piggybacks the same heartbeat, stored per display
  // so the editor can explain an unhealthy plugin next to its keys.
  if (parsed.bodyProviderHealth !== undefined) {
    recordProviderHealthReport(parsed.validatedDisplayId, parsed.bodyProviderHealth);
  }

  recordStatusViewport(request, body, parsed);

  return NextResponse.json({ ok: true });
}

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
