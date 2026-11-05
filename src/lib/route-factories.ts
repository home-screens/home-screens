import { NextRequest, NextResponse } from 'next/server';
import { withAuth, parseTagParam, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';
import { downloadAndSaveBackground, UnsupportedImageFormatError } from '@/lib/background-download';
import { isSafeExternalUrl } from '@/lib/url-safety';

/**
 * Factory for image-download POST handlers (NASA, Unsplash, etc.).
 * Validates imageUrl, runs an optional pre-download hook, then
 * downloads and saves the image as a background.
 */
export function createImageDownloadHandler(config: {
  defaultPrefix: string;
  downloadOptions?: { rejectNonWeb?: boolean; validateImage?: boolean };
  beforeDownload?: (body: Record<string, unknown>) => Promise<void> | void;
  /** Runs once the file is saved; a failure here never fails the download. */
  afterDownload?: (body: Record<string, unknown>) => Promise<void> | void;
  errorMsg: string;
}) {
  return withAuth(async (request: NextRequest) => {
    const parsed = await parseJsonBody<Record<string, unknown> | null>(request, { maxBytes: SMALL_BODY_BYTES });
    if (parsed instanceof NextResponse) return parsed;
    const body = parsed ?? {};
    const { imageUrl, filename } = body as { imageUrl?: string; filename?: string };

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    if (!(await isSafeExternalUrl(imageUrl))) {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    if (config.beforeDownload) {
      await config.beforeDownload(body);
    }

    let result;
    try {
      result = await downloadAndSaveBackground(
        imageUrl,
        filename || `${config.defaultPrefix}-${Date.now()}`,
        config.downloadOptions,
      );
    } catch (error) {
      // The source really is an image, just not one a browser can render. Say
      // so plainly instead of letting it fall through as a generic failure.
      if (error instanceof UnsupportedImageFormatError) {
        return NextResponse.json({ error: error.message }, { status: 415 });
      }
      throw error;
    }

    try {
      await config.afterDownload?.(body);
    } catch {
      // Housekeeping only.
    }

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
