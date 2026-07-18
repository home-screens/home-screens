import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { getInstalledPlugins } from '@/lib/plugins';
import { getPluginManifest } from '@/lib/plugin-utils';
import { audit } from '@/lib/audit';
import {
  startAuthorizationCodeFlow,
  startDeviceFlow,
  runClientCredentialsFlow,
  savePluginTokens,
  savePendingAuth,
} from '@/lib/plugin-auth';
import { garminLogin } from '@/lib/plugin-auth-garmin';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ pluginId: string }> };

interface StartBody {
  email?: string;
  password?: string;
}

/**
 * Begin a plugin auth flow. The response shape depends on the manifest's
 * declared adapter:
 *   - garmin: `{ email, password }` body → `{ status: 'connected' | 'mfa_required' }`
 *   - oauth2 authorization_code → `{ authUrl, redirectUri }` (open in a popup)
 *   - oauth2 device_code → `{ userCode, verificationUrl, expiresIn, interval }`
 *   - oauth2 client_credentials → `{ status: 'connected' }`
 */
export const POST = withAuth<RouteContext>(async (request, ctx) => {
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

  audit({ action: 'plugin_auth_start', pluginId, flow: auth.type === 'garmin' ? 'garmin' : auth.flow });

  try {
    if (auth.type === 'garmin') {
      const body = await parseJsonBody<StartBody>(request);
      if (body instanceof NextResponse) return body;
      if (!body.email || !body.password) {
        return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
      }
      const result = await garminLogin(body.email, body.password);
      if (result.status === 'mfa_required') {
        await savePendingAuth(pluginId, { kind: 'garmin_mfa', mfa: result.pending });
        return NextResponse.json({ status: 'mfa_required' });
      }
      await savePluginTokens(pluginId, result.tokens);
      audit({ action: 'plugin_auth_complete', pluginId });
      return NextResponse.json({ status: 'connected' });
    }

    if (auth.flow === 'authorization_code') {
      const { authUrl, redirectUri } = await startAuthorizationCodeFlow(pluginId, auth, request);
      return NextResponse.json({ authUrl, redirectUri });
    }
    if (auth.flow === 'device_code') {
      const start = await startDeviceFlow(pluginId, auth);
      return NextResponse.json(start);
    }
    // client_credentials — no user interaction beyond configured secrets
    await runClientCredentialsFlow(pluginId, auth);
    audit({ action: 'plugin_auth_complete', pluginId });
    return NextResponse.json({ status: 'connected' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign-in failed';
    audit({ action: 'plugin_auth_failure', pluginId, error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, 'Failed to start plugin authentication');
