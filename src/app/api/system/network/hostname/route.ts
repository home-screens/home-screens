import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { withAuth, parseJsonBody, execErrorMessage } from '@/lib/api-utils';
import { validateHostname } from '@/lib/network-validation';
import { logger } from '@/lib/logger';

const log = logger('network/hostname');

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFileCb);

/* ─── Route handler ─────────────────────────── */

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ hostname: string }>(request);
  if (body instanceof NextResponse) return body;

  const { hostname } = body;

  // 1. Validate hostname
  const hostnameResult = validateHostname(hostname);
  if (!hostnameResult.valid) {
    return NextResponse.json({ error: hostnameResult.error }, { status: 400 });
  }

  // 2. Set the hostname via hostnamectl
  try {
    await execFileAsync('sudo', ['hostnamectl', 'set-hostname', hostname]);
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: execErrorMessage(err, 'Failed to set hostname') },
      { status: 500 },
    );
  }

  // 3. Update /etc/hosts so avahi advertises the correct .local name.
  //    Read → modify in Node.js → write back via `sudo tee`. No user input
  //    is ever interpolated into shell/sed commands.
  try {
    const hostsContent = await readFile('/etc/hosts', 'utf-8');
    const newLine = `127.0.1.1 ${hostname} ${hostname}`;

    let updated: string;
    if (/^127\.0\.1\.1\s/m.test(hostsContent)) {
      updated = hostsContent.replace(/^127\.0\.1\.1\s.*$/m, newLine);
    } else {
      updated = hostsContent.trimEnd() + '\n' + newLine + '\n';
    }

    // Write back via sudo tee — hostname is a positional value in the
    // string, never a shell argument or sed expression
    const child = execFileCb('sudo', ['tee', '/etc/hosts'], (err) => {
      if (err) log.warn('Failed to update /etc/hosts:', err.message);
    });
    child.stdin?.write(updated);
    child.stdin?.end();
    await new Promise<void>((resolve) => child.on('close', resolve));
  } catch {
    // Non-fatal: hostname change still succeeded even if hosts update fails
  }

  // 4. Restart avahi-daemon for mDNS propagation
  try {
    await execFileAsync('sudo', ['systemctl', 'restart', 'avahi-daemon']);
  } catch (err: unknown) {
    // Non-fatal: avahi may not be installed; hostname change still succeeded
    log.warn(
      'avahi-daemon restart failed (non-fatal):',
      execErrorMessage(err, 'Unknown error'),
    );
  }

  // 5. Tell cloud-init to keep its hands off the hostname. Raspberry Pi OS
  //    ships cloud-init enabled, and its update_hostname module rewrites
  //    /etc/hostname on every boot from the cached user-data value — which
  //    would silently undo this change after the next reboot. The drop-in
  //    is a no-op on systems without cloud-init.
  try {
    const dropIn = 'preserve_hostname: true\n';
    const child = execFileCb(
      'sudo',
      ['tee', '/etc/cloud/cloud.cfg.d/99-home-screens-hostname.cfg'],
      (err) => {
        if (err)
          log.warn(
            'Failed to write cloud-init drop-in (non-fatal):',
            err.message,
          );
      },
    );
    child.stdin?.write(dropIn);
    child.stdin?.end();
    await new Promise<void>((resolve) => child.on('close', resolve));
  } catch {
    // Non-fatal: cloud-init may not be installed
  }

  return NextResponse.json({ ok: true, hostname });
}, 'Failed to update hostname');
