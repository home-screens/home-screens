import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { installExternalPlugin, MAX_PLUGIN_TARBALL_BYTES } from '@/lib/plugins';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { resolveTarballUrl, validateExternalUrl, urlForAudit } from '@/lib/external-plugins';
import { fetchWithAllowedRedirects } from '@/lib/guarded-fetch';
import { isSafeExternalUrl } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

const MAX_REDIRECT_HOPS = 5;
const DOWNLOAD_TIMEOUT_MS = 60_000;

const BLOCKED_ADDRESS = 'URL resolves to a blocked address (internal network, loopback, or cloud metadata).';

/**
 * Address check for the URL a person typed. `validateExternalUrl` only checks
 * the URL scheme; this adds DNS-resolved IP filtering so `https://evil.com`
 * that resolves to `192.168.1.1` (or `169.254.169.254`, or a ULA IPv6) is
 * rejected before we reach fetch. `http://localhost` / `http://127.0.0.1`
 * are allowed for local testing and pinned to their literal form by the
 * scheme check.
 */
async function guardTypedUrl(url: string): Promise<string | null> {
  try {
    validateExternalUrl(url);
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid URL';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }
  if (parsed.protocol === 'https:') return (await isSafeExternalUrl(url)) ? null : BLOCKED_ADDRESS;
  // The scheme check reads the start of the text, which
  // `http://localhost:x@other-host/` also passes. The parsed host is what
  // would be fetched, so that is what has to be this machine.
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!local || parsed.username || parsed.password) {
    return 'URLs must use HTTPS. http://localhost is allowed for local testing.';
  }
  return null;
}

/**
 * Address check for a redirect target. The localhost allowance is for the
 * address a person typed, never for where a download host sends the hub
 * next: a public tarball host answering 302 to `http://127.0.0.1:<port>/`
 * would otherwise have the hub fetch its own services. So a later hop must
 * be https and must pass the full check.
 */
async function guardRedirectUrl(url: string): Promise<string | null> {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return 'Invalid URL';
  }
  if (protocol !== 'https:') return 'URLs must use HTTPS.';
  if (!(await isSafeExternalUrl(url))) return BLOCKED_ADDRESS;
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

  const displayUrl = urlForAudit(resolvedUrl);

  // The shared fetch follows redirects by hand so every hop is checked before
  // it is fetched (letting fetch follow them would let an allowed public host
  // 302 to http://169.254.169.254/ or https://10.0.0.5/), and stops reading
  // at the cap so a link to something huge cannot fill the hub's memory.
  // The first check is the typed address (hop 0); each later one a redirect.
  let guardError: string | null = null;
  let checkedHop = -1;
  const result = await fetchWithAllowedRedirects(resolvedUrl, {
    allowHosts: ['*'],
    maxHops: MAX_REDIRECT_HOPS,
    maxBytes: MAX_PLUGIN_TARBALL_BYTES,
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    retries: 0,
    isSafe: async (url, hop) => {
      checkedHop = hop;
      guardError = hop === 0 ? await guardTypedUrl(url) : await guardRedirectUrl(url);
      return guardError === null;
    },
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'blocked':
      case 'not-allowed': {
        const why = guardError ?? BLOCKED_ADDRESS;
        return NextResponse.json({ error: checkedHop > 0 ? `Redirect blocked: ${why}` : why }, { status: 400 });
      }
      case 'too-many-redirects':
        return NextResponse.json({ error: `${displayUrl} returned too many redirects.` }, { status: 502 });
      case 'invalid-url':
        // Before any check ran, it is the typed address that cannot be read.
        if (checkedHop < 0) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        return NextResponse.json({ error: `${displayUrl} returned an invalid redirect Location.` }, { status: 502 });
      case 'too-large':
        return NextResponse.json(
          { error: `${displayUrl} is too big to be a plugin (over ${MAX_PLUGIN_TARBALL_BYTES / (1024 * 1024)} MB). Check that the URL points at a tarball.` },
          { status: 502 },
        );
      default:
        return NextResponse.json(
          {
            error: `Could not download from ${displayUrl}`,
            detail: result.reason === 'timeout' ? 'it took too long to answer' : 'it could not be reached',
          },
          { status: 502 },
        );
    }
  }
  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(
      { error: `${displayUrl} returned HTTP ${result.status}. Check that the URL points at a tarball.` },
      { status: 502 },
    );
  }

  const buffer = Buffer.from(result.body.buffer, result.body.byteOffset, result.body.byteLength);
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
