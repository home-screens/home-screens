import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { getLatestSourceStatus } from '@/lib/calendar-source-status';

export const dynamic = 'force-dynamic';

/**
 * Read-only view of the most recent calendar fetch's per-source health.
 * The editor's settings health panel polls this instead of /api/calendar:
 * it costs nothing, never mints a new cache entry, and never touches the
 * per-source saved-events map. Empty until the first calendar fetch of the
 * process (the panel falls back to one regular fetch in that case).
 *
 * Gated like /api/calendar itself: the payload carries calendar names and
 * upstream error text, so it is not public.
 */
export const GET = withDisplayAuth(
  async () => NextResponse.json({ sourceStatus: getLatestSourceStatus() }),
  'Failed to read calendar status',
);
