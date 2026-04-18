/**
 * GET /api/system/diagnostics
 *
 * Returns a ZIP bundle of everything a developer typically needs to triage
 * a Home Screens install: redacted config, secrets presence map, system
 * stats snapshot, per-display status/hw/browser/console, last journalctl
 * slice, installed plugin manifests, recent telemetry metadata, and a
 * grepped error summary.
 *
 * Flow:
 *   1. Broadcast `dump-console-log` to every known display.
 *   2. Poll `getConsoleLog` every 500 ms for up to 5 s so displays that are
 *      actually online have a chance to upload their buffer.
 *   3. Gather all other inputs in parallel.
 *   4. Hand everything to `composeDiagnosticsBundle` (T10) and stream the
 *      resulting archive straight to the client.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import os from 'os';
import { Readable } from 'stream';
import { withAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { getSecretStatus, readSecrets } from '@/lib/secrets';
import { readTelemetryData } from '@/lib/telemetry';
import { getInstalledPlugins } from '@/lib/plugins';
import { redactConfig } from '@/lib/config-redactor';
import {
  clearConsoleLog,
  enqueueCommand,
  getAllDisplayStatuses,
  getConsoleLog,
  type DisplayStatus,
} from '@/lib/display-commands';
import {
  composeDiagnosticsBundle,
  type BundleDisplayEntry,
  type BundlePlugin,
} from '@/lib/diagnostics-bundle';

export const dynamic = 'force-dynamic';

const CONSOLE_LOG_WAIT_MS = 5_000;
const CONSOLE_LOG_POLL_MS = 500;
const JOURNAL_LINES = 500;
/** Defensive upper bound for the journal text carried in the bundle. */
const JOURNAL_MAX_BYTES = 1_000_000;

/**
 * Runs `journalctl -u home-screens` and captures the last N lines. Always
 * resolves with a string: on missing binary / non-zero exit, we embed a
 * short diagnostic (plus a hint for the systemd-journal group fix) in
 * place of the log so the bundle is still useful on non-systemd hosts.
 */
function runJournalctl(): Promise<string> {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('journalctl', [
        '-u',
        'home-screens',
        '--no-pager',
        '-n',
        String(JOURNAL_LINES),
      ]);
    } catch (err) {
      resolve(
        `journalctl is not available: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout?.on('data', (c: Buffer) => out.push(c));
    proc.stderr?.on('data', (c: Buffer) => err.push(c));
    proc.on('error', (e) => {
      resolve(`journalctl is not installed or not on PATH: ${e.message}`);
    });
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(Buffer.concat(out).toString('utf8'));
      } else {
        const stderr = Buffer.concat(err).toString('utf8').slice(0, 500);
        resolve(
          `journalctl unavailable (exit ${code}).\n` +
            `stderr: ${stderr}\n\n` +
            `Fix: sudo usermod -aG systemd-journal home-screens && sudo systemctl restart home-screens`,
        );
      }
    });
  });
}

/** Scrape ERROR/WARN/uncaught/unhandled lines from the journal text. */
function grepErrors(journal: string): string {
  const lines = journal.split('\n');
  const matches = lines.filter((l) => /\b(ERROR|WARN|uncaught|unhandled)\b/i.test(l));
  if (matches.length === 0) {
    return `No ERROR/WARN lines in last ${JOURNAL_LINES} journal entries.\n`;
  }
  return matches.slice(-200).join('\n') + '\n';
}

/**
 * Map installed plugins into the bundle's BundlePlugin shape. We keep only
 * the InstalledPlugin metadata (id/version/source) plus a manifest excerpt
 * with any *Url fields stripped, since URLs can carry tokens or hostnames
 * users would rather not ship to a stranger.
 */
async function loadPlugins(): Promise<BundlePlugin[]> {
  const installed = await getInstalledPlugins().catch(() => null);
  if (!installed?.plugins) return [];

  return installed.plugins.map((p) => ({
    id: p.id,
    version: p.version ?? 'unknown',
    // InstalledPlugin doesn't carry the full manifest — emit the metadata we
    // do have, with any *url fields dropped (the externalUrl can contain
    // the tarball host). Authors with sensitive install URLs get redaction
    // without a second code path.
    manifestExcerpt: Object.fromEntries(
      Object.entries({
        id: p.id,
        version: p.version,
        moduleType: p.moduleType,
        enabled: p.enabled,
        installedAt: p.installedAt,
        source: p.source,
      }).filter(([k, v]) => v !== undefined && !/url$/i.test(k)),
    ),
  }));
}

/**
 * Fan `dump-console-log` out to each configured display's own queue and poll
 * the shared `consoleLogMap` every 500 ms for up to 5 s. Returns a record
 * keyed by display ID where each value is the uploaded entries (or `null`
 * when the display did not respond in time — the composer renders that as a
 * "[timeout]" note in the bundle).
 *
 * We enqueue per-ID instead of using the `'all'` broadcast because broadcast
 * only reaches displays already tracked in `knownDisplays` (those that have
 * polled since the last hub restart). A display adopted in config but offline
 * or freshly-booted would miss the solicit under the broadcast path, and the
 * diagnostics bundle would silently drop its console log.
 */
async function solicitConsoleLogs(
  displayIds: string[],
): Promise<Record<string, ReturnType<typeof getConsoleLog>>> {
  const result: Record<string, ReturnType<typeof getConsoleLog>> = {};
  if (displayIds.length === 0) return result;

  for (const id of displayIds) {
    result[id] = null;
    // Evict any previous bundle's cached log BEFORE enqueueing the dump —
    // otherwise the poll loop below returns the stale entries instantly
    // and never waits for the fresh upload this bundle is soliciting.
    clearConsoleLog(id);
    enqueueCommand(id, 'dump-console-log');
  }
  // Legacy single-display clients poll without a ?display= parameter and
  // drain the __default__ queue, so also push there when we fell back to
  // the conventional 'main' ID. This is the one case where a single
  // solicit must land in two queues.
  if (displayIds.length === 1 && displayIds[0] === 'main') {
    enqueueCommand(undefined, 'dump-console-log');
  }

  const deadline = Date.now() + CONSOLE_LOG_WAIT_MS;
  while (Date.now() < deadline) {
    let pending = false;
    for (const id of displayIds) {
      if (result[id]) continue;
      const logs = getConsoleLog(id);
      if (logs) {
        result[id] = logs;
      } else {
        pending = true;
      }
    }
    if (!pending) break;
    await new Promise((r) => setTimeout(r, CONSOLE_LOG_POLL_MS));
  }
  return result;
}

export const GET = withAuth(async (request) => {
  const config = await readConfig();
  // Multi-display installs enumerate the registry; legacy single-display
  // installs fall back to the conventional 'main' ID so we still dump
  // whatever status/console data the lone display has posted.
  const displayIds =
    config.displays && config.displays.length > 0
      ? config.displays.map((d) => d.id)
      : ['main'];

  const [
    statuses,
    consoleLogs,
    secretsStatus,
    secretsResolved,
    systemStatsJson,
    telemetryRecent,
    journal,
    plugins,
  ] = await Promise.all([
    Promise.resolve(getAllDisplayStatuses()),
    solicitConsoleLogs(displayIds),
    getSecretStatus().catch(() => ({} as Record<string, boolean>)),
    readSecrets().catch(() => ({} as Record<string, string>)),
    // Invoke the stats route handler directly so we don't pay for an HTTP
    // round-trip (or need a base URL) just to embed the JSON.
    import('@/app/api/system/stats/route')
      .then(async (m) => {
        const res = await m.GET(request);
        return res.json();
      })
      .catch(() => null),
    readTelemetryData().catch(() => null),
    runJournalctl(),
    loadPlugins(),
  ]);

  const knownSecretValues = Object.values(secretsResolved).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  const redactedConfig = redactConfig(config, { knownSecretValues });

  const displays: BundleDisplayEntry[] = displayIds.map((id) => {
    const status: DisplayStatus | null = statuses.get(id) ?? null;
    const log = consoleLogs[id];
    return {
      id,
      status,
      hwStats: status?.hwStats ?? null,
      browserStats: status?.browserStats ?? null,
      consoleLog: log ?? null,
      consoleLogNote: log ? null : '[timeout] Display did not respond within 5s',
    };
  });

  // Clamp the journal to 1 MB so a noisy host can't dominate the archive.
  // Per-display console buffers and the redacted config carry their own
  // intrinsic caps (MAX_ENTRIES in the console-log route, redacted secret
  // values stripped from config). The result is a bundle that's comfortably
  // under the low megabytes in the common case without needing a mid-stream
  // abort or a cumulative size accumulator here.
  const journalTruncated = journal.length > JOURNAL_MAX_BYTES;
  const journalText = journalTruncated
    ? journal.slice(-JOURNAL_MAX_BYTES)
    : journal;

  const stream = composeDiagnosticsBundle({
    meta: {
      version: process.env.npm_package_version ?? 'unknown',
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: `${os.platform()}-${os.arch()}`,
      truncated: journalTruncated ? ['logs/journalctl-home-screens.log'] : undefined,
    },
    redactedConfig,
    secretsStatus,
    systemStats: systemStatsJson,
    displays,
    journalctlText: journalText,
    plugins,
    telemetryRecent,
    errorsSummary: grepErrors(journalText),
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="home-screens-diagnostics-${ts}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}, 'Failed to generate diagnostics bundle');
