import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getInstalledPlugins } from '@/lib/plugins';
import { getPluginManifest } from '@/lib/plugin-utils';
import { audit } from '@/lib/audit';
import { pollDeviceFlow, loadPendingAuth, savePluginTokens, deletePendingAuth } from '@/lib/plugin-auth';
import { garminContinueMfa } from '@/lib/plugin-auth-garmin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

interface PollBody {
  mfaCode?: string;
}

/**
 * Advance an in-progress flow:
 *   - oauth2 device_code → poll the token endpoint (server-throttled to the
 *     provider's interval); returns `{ status: 'pending' | 'connected' | ... }`
 *   - garmin → submit the one-time MFA code (`{ mfaCode }`); wrong codes are
 *     retryable until the pending state expires
 */
export const PUT = withAuth<RouteContext>(async (request, ctx) => {
  const { pluginId } = await ctx.params;

  const installed = await getInstalledPlugins();
  const plugin = installed.plugins.find((p) => p.id === pluginId && p.enabled);
  if (!plugin) {
    return NextResponse.json({ error: 'Plugin not installed or not enabled' }, { status: 404 });
  }

  const manifest = await getPluginManifest(pluginId);
  const auth = manifest?.auth;
  if (!auth) {
    return NextResponse.json({ error: 'Plugin does not declare an auth adapter' }, { status: 400 });
  }

  try {
    if (auth.type === 'garmin') {
      const body = await parseJsonBody<PollBody>(request);
      if (body instanceof NextResponse) return body;
      if (!body.mfaCode) {
        return NextResponse.json({ error: 'Enter the code Garmin sent you.' }, { status: 400 });
      }
      const pending = await loadPendingAuth(pluginId);
      if (!pending || pending.kind !== 'garmin_mfa') {
        return NextResponse.json(
          { error: 'This sign-in attempt has expired. Sign in again.' },
          { status: 409 },
        );
      }
      const result = await garminContinueMfa(pending.mfa, body.mfaCode);
      if (result.status === 'mfa_required') {
        return NextResponse.json({ status: 'mfa_required', error: result.error });
      }
      await savePluginTokens(pluginId, result.tokens);
      await deletePendingAuth(pluginId);
      audit({ action: 'plugin_auth_complete', pluginId });
      return NextResponse.json({ status: 'connected' });
    }

    if (auth.flow !== 'device_code') {
      return NextResponse.json({ error: 'This plugin does not use a polling flow.' }, { status: 400 });
    }
    const result = await pollDeviceFlow(pluginId, auth);
    if (result.status === 'connected') {
      audit({ action: 'plugin_auth_complete', pluginId });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign-in failed';
    audit({ action: 'plugin_auth_failure', pluginId, error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, 'Failed to advance plugin authentication');
