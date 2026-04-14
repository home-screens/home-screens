import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { installExternalPlugin } from '@/lib/plugins';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { resolveTarballUrl, validateExternalUrl, urlForAudit } from '@/lib/external-plugins';

export const dynamic = 'force-dynamic';

/** Install a plugin from a user-provided tarball URL (outside the marketplace). */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { tarballUrl, version } = body as { tarballUrl?: string; version?: string };

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

  // Strip query-string before showing the URL in errors/logs, so any token
  // embedded in the query (e.g. GitHub release download token) never reaches
  // the client response body or the audit log.
  const displayUrl = urlForAudit(resolvedUrl);

  let res: Response;
  try {
    res = await fetchWithTimeout(resolvedUrl, { timeout: 60_000 });
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
