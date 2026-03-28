import { NextRequest, NextResponse } from 'next/server';
import { withAuth, parseTagParam } from '@/lib/api-utils';
import { downloadAndSaveBackground } from '@/lib/background-download';
import { isSafeExternalUrl } from '@/lib/url-safety';

/**
 * Factory for image-download POST handlers (NASA, Unsplash, etc.).
 * Validates imageUrl, runs an optional pre-download hook, then
 * downloads and saves the image as a background.
 */
export function createImageDownloadHandler(config: {
  defaultPrefix: string;
  downloadOptions?: { convertNonWeb?: boolean; validateImage?: boolean };
  beforeDownload?: (body: Record<string, unknown>) => Promise<void> | void;
  errorMsg: string;
}) {
  return withAuth(async (request: NextRequest) => {
    const body = await request.json();
    const { imageUrl, filename } = body as { imageUrl?: string; filename?: string };

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    if (!isSafeExternalUrl(imageUrl)) {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    if (config.beforeDownload) {
      await config.beforeDownload(body);
    }

    const result = await downloadAndSaveBackground(
      imageUrl,
      filename || `${config.defaultPrefix}-${Date.now()}`,
      config.downloadOptions,
    );

    return NextResponse.json(result, { status: 201 });
  }, config.errorMsg);
}

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
