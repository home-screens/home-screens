import { NextRequest, NextResponse } from 'next/server';
import { withAuth, parseTagParam } from '@/lib/api-utils';

/**
 * Factory for upgrade/rollback POST handlers that share the same
 * parse-tag → check-busy → run-in-background pattern.
 */
export function createTagActionRoute(
  actionFn: (tag: string) => Promise<void>,
  opts: { busyCheck: () => boolean; verb: string; errorMsg: string },
) {
  return withAuth(async (request: NextRequest) => {
    if (opts.busyCheck()) {
      return NextResponse.json(
        { error: 'An upgrade is already in progress' },
        { status: 409 },
      );
    }

    const tag = await parseTagParam(request);
    if (tag instanceof NextResponse) return tag;

    actionFn(tag).catch(() => {
      // Error is captured in progress state
    });

    return NextResponse.json({ ok: true, message: `${opts.verb} to ${tag} started` });
  }, opts.errorMsg);
}
