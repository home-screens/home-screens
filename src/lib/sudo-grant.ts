/**
 * Passwordless sudo for the account running the service.
 *
 * Updates, WiFi changes, hostname changes and restarts all go through sudo,
 * and a device whose account lacks a NOPASSWD grant cannot do any of them.
 * The shell side (`scripts/upgrade.sh sudo-check` / `grant-sudo`) owns the
 * repair: it tries the image default password silently for the image
 * account, and otherwise writes the grant from a password the person types
 * into the editor. This module is the Node face of those two actions.
 *
 * The password only ever travels on the child's stdin. It is never an
 * argument (visible in the process list), never logged, never stored.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const APP_DIR = process.env.HOME_SCREENS_DIR || '/opt/home-screens/current';
const SCRIPT_TIMEOUT_MS = 30_000;

export const SUDO_NEEDS_PASSWORD_MESSAGE =
  'This device is not set up to let Home Screens make system changes without a password.';

export interface SudoCheckResult {
  ok: boolean;
  needsPassword?: boolean;
  error?: string;
}

export interface SudoGrantResult {
  ok: boolean;
  wrongPassword?: boolean;
  alreadyGranted?: boolean;
  error?: string;
}

/** A positive answer is final for the life of the process: grants do not vanish. */
let granted = false;

/** Test hook. */
export function resetSudoCache(): void {
  granted = false;
}

function scriptPath(): { cwd: string; script: string } {
  const installed = path.join(APP_DIR, 'scripts', 'upgrade.sh');
  if (existsSync(installed)) return { cwd: APP_DIR, script: installed };
  const local = path.join(process.cwd(), 'scripts', 'upgrade.sh');
  return { cwd: process.cwd(), script: local };
}

function parseLastLine(output: string): Record<string, unknown> {
  const lines = output.trim().split('\n');
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return { ok: false, error: 'The device gave an unexpected answer.' };
  }
}

function runAction(action: string, stdinText?: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const { cwd, script } = scriptPath();
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('bash', [script, action], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    let stdout = '';
    let settled = false;
    const finish = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: 'The device took too long to answer.' });
    }, SCRIPT_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.resume();
    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        finish({ ok: false, error: `sudo ${action} exited with code ${code}` });
        return;
      }
      finish(parseLastLine(stdout));
    });

    if (child.stdin) {
      if (stdinText !== undefined) child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}

/**
 * Is passwordless sudo available for the service account? Repairs it silently
 * when the image default password still works. The answer is cached once it
 * is yes.
 */
export async function ensureSudo(): Promise<SudoCheckResult> {
  if (granted) return { ok: true };
  const result = await runAction('sudo-check');
  if (result.ok === true) {
    granted = true;
    return { ok: true };
  }
  return {
    ok: false,
    needsPassword: result.needsPassword === true,
    error: typeof result.error === 'string' ? result.error : SUDO_NEEDS_PASSWORD_MESSAGE,
  };
}

/** Write the grant using the device password. The password goes to stdin only. */
export async function grantSudo(password: string): Promise<SudoGrantResult> {
  const result = await runAction('grant-sudo', `${password}\n`);
  if (result.ok === true) {
    granted = true;
    return { ok: true, alreadyGranted: result.alreadyGranted === true };
  }
  return {
    ok: false,
    wrongPassword: result.wrongPassword === true,
    error: typeof result.error === 'string' ? result.error : 'Could not allow system changes.',
  };
}

/**
 * Route guard: null when sudo is ready, otherwise the 409 response the editor
 * turns into its password prompt.
 */
export async function requireSudo(): Promise<NextResponse | null> {
  const result = await ensureSudo();
  if (result.ok) return null;
  return NextResponse.json(
    {
      ok: false,
      error: result.error ?? SUDO_NEEDS_PASSWORD_MESSAGE,
      needsSudoPassword: true,
    },
    { status: 409 },
  );
}
