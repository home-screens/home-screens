import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { setConsoleLog } from '@/lib/display-commands';
import { isValidDisplayId } from '@/lib/display-filter';
import { withDisplayAuth } from '@/lib/api-utils';
import type { ConsoleLogEntry } from '@/lib/hardware-stats';

export const dynamic = 'force-dynamic';

/** Cap to stop a rogue client from flooding the hub. */
const MAX_ENTRIES = 500;
const MAX_MESSAGE_LEN = 2_000;

function parseEntry(e: unknown): ConsoleLogEntry | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const level = o.level;
  if (level !== 'log' && level !== 'warn' && level !== 'error') return null;
  const message = typeof o.message === 'string' ? o.message.slice(0, MAX_MESSAGE_LEN) : null;
  const timestamp = typeof o.timestamp === 'number' && Number.isFinite(o.timestamp) ? o.timestamp : null;
  if (message === null || timestamp === null) return null;
  return { level, message, timestamp };
}

export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => null) as {
    displayId?: unknown; entries?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const displayId = body.displayId;
  if (typeof displayId !== 'string' || !isValidDisplayId(displayId)) {
    return NextResponse.json({ error: 'Invalid displayId' }, { status: 400 });
  }
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'entries must be an array' }, { status: 400 });
  }

  const parsed: ConsoleLogEntry[] = [];
  for (const raw of body.entries) {
    const entry = parseEntry(raw);
    if (entry) parsed.push(entry);
    if (parsed.length >= MAX_ENTRIES) break;
  }
  setConsoleLog(displayId, parsed);
  return NextResponse.json({ ok: true, stored: parsed.length });
}, 'Failed to store console log');
