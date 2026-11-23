import type { NextRequest } from 'next/server';
import { handleAuthorizationCodeCallback } from '@/lib/plugin-auth';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { householdWords } from '@/lib/household-words';

export const dynamic = 'force-dynamic';

const log = logger('plugin-auth-callback');

/**
 * Shared OAuth2 redirect target for ALL plugins using the authorization_code
 * flow — a single URL to register per installation, not one per plugin. The
 * pluginId travels in the HMAC-signed `state` parameter, so this route is
 * PUBLIC (the provider redirects the user's browser here with no session
 * cookie) but only acts on a validly-signed state. Registered in
 * `PUBLIC_AUTH_ROUTES` (`src/proxy.ts`).
 *
 * Renders a tiny page, in the household's language, that notifies the
 * opener and closes the popup. The reason a sign-in failed goes to the
 * opener and the log; the page itself only says it did not work.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  if (providerError) {
    log.warn('Plugin OAuth provider refused the sign-in:', providerError);
    return htmlResponse(await resultPage(false, providerError));
  }
  if (!code || !state) {
    return htmlResponse(await resultPage(false, 'Missing authorization code'));
  }

  try {
    const pluginId = await handleAuthorizationCodeCallback(code, state);
    audit({ action: 'plugin_auth_complete', pluginId });
    return htmlResponse(await resultPage(true, null, pluginId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign-in failed';
    log.error('Plugin OAuth callback failed:', message);
    return htmlResponse(await resultPage(false, message));
  }
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** Escape a string for safe interpolation inside an HTML text node / JS string literal. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resultPage(success: boolean, error: string | null, pluginId?: string): Promise<string> {
  // JSON.stringify keeps the postMessage payload injection-safe; the `<` guard
  // prevents a `</script>` breakout inside the inline script.
  const payload = JSON.stringify(
    success
      ? { type: 'plugin-auth-success', pluginId }
      : { type: 'plugin-auth-error', error },
  ).replace(/</g, '\\u003c');
  const { locale, t } = await householdWords('editor');
  const heading = esc(t(success ? 'settings.pluginAuth.connectedLabel' : 'settings.pluginAuth.popup.failedTitle'));
  const detail = esc(t(success ? 'settings.pluginAuth.popup.closeWindow' : 'settings.pluginAuth.popup.failedBody'));

  return `<!doctype html>
<html lang="${esc(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f1115; color: #e6e8eb;
    display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; max-width: 22rem; padding: 2rem; }
  h1 { font-size: 1.1rem; margin: 0 0 0.5rem; }
  p { font-size: 0.9rem; color: #9aa0a6; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${detail}</p>
  </div>
  <script>
    (function () {
      // The opener (the editor popup launcher) is served from this same host,
      // so pin the target origin rather than broadcasting to '*'.
      try { if (window.opener) window.opener.postMessage(${payload}, window.location.origin); } catch (e) {}
      setTimeout(function () { window.close(); }, ${success ? 400 : 2500});
    })();
  </script>
</body>
</html>`;
}
