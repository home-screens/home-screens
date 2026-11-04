import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { withAuth, parseJsonBody, errorResponse } from '@/lib/api-utils';
import { requireSudo } from '@/lib/sudo-grant';
import { isKnownTimezone } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFileCb);

/**
 * PUT /api/system/timezone
 * Body: { timezone: "Europe/Berlin" }
 *
 * Sets the *device's* clock zone, which is a separate thing from
 * `settings.timezone`: the screens already render in the configured zone
 * regardless of what the machine thinks. What this fixes is the timestamps
 * the device writes for itself (service logs, diagnostics bundles), which
 * on an image-flashed Pi are stamped UTC because nobody ever chose otherwise.
 *
 * Only ever called because someone pressed the button on the Location page.
 * Saving a display setting must never mutate the machine's clock as a side
 * effect, so there is no automatic path into here.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ timezone?: unknown }>(request);
  if (body instanceof NextResponse) return body;

  const { timezone } = body;

  // Allowlist, not a pattern: the argument must be a zone this runtime
  // actually knows, and nothing else. `execFile` spawns without a shell, so
  // metacharacters are already inert, but "is a real IANA zone" is the
  // guarantee worth making. Share the check with the editor rather than
  // spelling it out again here: when the two drifted, the page offered a
  // button the API then refused.
  if (typeof timezone !== 'string' || !isKnownTimezone(timezone)) {
    return NextResponse.json({ error: 'Unknown timezone' }, { status: 400 });
  }

  const sudo = await requireSudo();
  if (sudo) return sudo;

  try {
    await execFileAsync('sudo', ['timedatectl', 'set-timezone', timezone]);
  } catch (err: unknown) {
    return errorResponse(err, 'Failed to set the device timezone');
  }

  // Node resolves the system zone once and caches it, so without this the
  // running process (and everything it stamps) would stay on the old zone
  // until the service restarted, and the Location page would keep reporting the
  // mismatch it just offered to fix. Assigning `process.env.TZ` is the
  // supported way to invalidate that cache; it covers `Intl` too on Node 16+.
  process.env.TZ = timezone;

  return NextResponse.json({ ok: true, timezone });
}, 'Failed to set the device timezone');
