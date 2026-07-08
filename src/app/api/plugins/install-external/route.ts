import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { installExternalPlugin } from '@/lib/plugins';
import { fetchWithTimeout, withAuth, parseJsonBody } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { resolveTarballUrl, validateExternalUrl, urlForAudit } from '@/lib/external-plugins';
import { isSafeExternalUrl } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

const MAX_REDIRECT_HOPS = 5;
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * SSRF guard for a resolved tarball URL. `validateExternalUrl` only checks
 * the URL scheme; this adds DNS-resolved IP filtering so `https://evil.com`
 * that resolves to `192.168.1.1` (or `169.254.169.254`, or a ULA IPv6) is
 * rejected before we reach fetch. `http://localhost` / `http://127.0.0.1`
 * are pinned to their literal form by the scheme check and don't need
 * further validation.
 */
async function guardFetchUrl(url: string): Promise<string | null> {
  try {
    validateExternalUrl(url);
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid URL';
  }
  if (url.startsWith('https://') && !(await isSafeExternalUrl(url))) {
    return 'URL resolves to a blocked address (internal network, loopback, or cloud metadata).';
  }
  return null;
}

/** Install a plugin from a user-provided tarball URL (outside the marketplace). */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ tarballUrl?: string; version?: string }>(request);
  if (body instanceof NextResponse) return body;
  const { tarballUrl, version } = body;

  if (!tarballUrl || typeof tarballUrl !== 'string') {
    return NextResponse.json({ error: 'tarballUrl is required' }, { status: 400 });
  }

  try {
    validateExternalUrl(tarballUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid URL' },
      { status: 400 },
    );
  }

  let resolvedUrl: string;
  try {
    resolvedUrl = resolveTarballUrl(tarballUrl, version);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid URL';
    return NextResponse.json(
      { error: `This URL has a {version} placeholder — enter which version to install. (${msg})` },
      { status: 400 },
    );
  }

  const initialGuardError = await guardFetchUrl(resolvedUrl);
  if (initialGuardError) {
    return NextResponse.json({ error: initialGuardError }, { status: 400 });
  }

  const displayUrl = urlForAudit(resolvedUrl);

  // Follow redirects manually so every hop is re-validated. Letting fetch
  // follow redirects automatically would let an allowed public host 302 to
  // http://169.254.169.254/ or https://10.0.0.5/, defeating the DNS check.
  let currentUrl = resolvedUrl;
  let res!: Response;
  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      res = await fetchWithTimeout(currentUrl, {
        timeout: DOWNLOAD_TIMEOUT_MS,
        redirect: 'manual',
        retries: 0,
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get('location');
      if (!location) break;
      if (hop === MAX_REDIRECT_HOPS) {
        return NextResponse.json(
          { error: `${displayUrl} returned too many redirects.` },
          { status: 502 },
        );
      }
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return NextResponse.json(
          { error: `${displayUrl} returned an invalid redirect Location.` },
          { status: 502 },
        );
      }
      const redirectGuardError = await guardFetchUrl(nextUrl);
      if (redirectGuardError) {
        return NextResponse.json(
          { error: `Redirect blocked: ${redirectGuardError}` },
          { status: 400 },
        );
      }
      currentUrl = nextUrl;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    return NextResponse.json(
      { error: `Could not download from ${displayUrl}`, detail },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `${displayUrl} returned HTTP ${res.status}. Check that the URL points at a tarball.` },
      { status: 502 },
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  try {
    const { pluginId, version: installedVersion } = await installExternalPlugin(tarballUrl, buffer);
    audit({
      action: 'plugin_install_external',
      pluginId,
      version: installedVersion,
      tarballUrl: displayUrl,
    });
    return NextResponse.json({ ok: true, pluginId, version: installedVersion, sha256 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Install failed';
    // Collisions → 409; validation errors → 400
    const status = /already installed/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}, 'Failed to install external plugin');
