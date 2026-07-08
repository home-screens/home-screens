import { NextResponse } from 'next/server';
import { spawn, execSync } from 'child_process';
import { errorResponse, withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/system/power
 * Body: { action: "reboot" | "restart-service" }
 *
 * Both actions use a short delay so the API can respond before the process dies.
 */
export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ action?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { action } = body;

  if (action === 'restart-service') {
    return restartService();
  }

  if (action === 'reboot') {
    return rebootSystem();
  }

  return NextResponse.json({ error: 'Invalid action. Use "reboot" or "restart-service".' }, { status: 400 });
}, 'Power action failed');

function restartService(): NextResponse {
  try {
    // Check if the service is managed by systemd
    const result = isSystemdService();
    if (!result) {
      return NextResponse.json(
        { error: 'Service not managed by systemd. Restart manually.' },
        { status: 400 },
      );
    }

    // Schedule restart with a short delay so the response can be sent first
    spawn('bash', ['-c', 'sleep 2 && sudo systemctl restart home-screens'], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    return NextResponse.json({ ok: true, message: 'Service restart scheduled' });
  } catch (error) {
    return errorResponse(error, 'Power action failed');
  }
}

function rebootSystem(): NextResponse {
  try {
    // Schedule reboot with a short delay so the response can be sent first
    spawn('bash', ['-c', 'sleep 2 && sudo reboot'], {
      detached: true,
      stdio: 'ignore',
    }).unref();

    return NextResponse.json({ ok: true, message: 'System reboot scheduled' });
  } catch (error) {
    return errorResponse(error, 'Power action failed');
  }
}

function isSystemdService(): boolean {
  try {
    execSync('systemctl is-active home-screens', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
