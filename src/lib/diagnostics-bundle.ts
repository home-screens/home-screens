/**
 * Streams a diagnostics bundle as a ZIP. Pure composer — takes an already-
 * gathered input shape and returns a Readable stream of ZIP bytes. The
 * endpoint layer (src/app/api/system/diagnostics/route.ts) is responsible
 * for gathering the input (reading config, journalctl, plugins, etc.).
 */

import archiver from 'archiver';
import { Readable } from 'stream';
import type { ScreenConfiguration } from '@/types/config';
import type { DisplayStatus } from '@/lib/display-commands';
import type { HardwareStats, BrowserStats, ConsoleLogEntry } from '@/lib/hardware-stats';

export interface BundleMeta {
  version: string;
  generatedAt: string;
  node: string;
  platform: string;
  /**
   * Non-empty when one or more inputs were truncated by a per-input cap
   * (currently only the journalctl text is capped, at 1 MB). Surfaces in
   * the UI and in the bundle README.
   */
  truncated?: string[];
}

export interface BundleDisplayEntry {
  id: string;
  status: DisplayStatus | null;
  hwStats: HardwareStats | null;
  browserStats: BrowserStats | null;
  consoleLog: ConsoleLogEntry[] | null;
  /** When console log is null, a short note for console.log (e.g. "[timeout]"). */
  consoleLogNote: string | null;
}

export interface BundlePlugin {
  id: string;
  version: string;
  manifestExcerpt: Record<string, unknown>;
}

export interface BundleInput {
  meta: BundleMeta;
  redactedConfig: ScreenConfiguration;
  secretsStatus: Record<string, boolean>;
  systemStats: unknown;
  displays: BundleDisplayEntry[];
  journalctlText: string;
  plugins: BundlePlugin[];
  telemetryRecent: unknown;
  errorsSummary: string;
}

function renderReadme(input: BundleInput): string {
  const displays = input.displays.map((d) => `- **${d.id}**`).join('\n');
  return `# Home Screens diagnostics bundle

Generated: ${input.meta.generatedAt}
Version:   ${input.meta.version}
Platform:  ${input.meta.platform} (node ${input.meta.node})

## Contents

- \`meta.json\` — bundle version, timestamp, truncation notes
- \`config-redacted.json\` — user's configuration with secrets removed
- \`secrets-status.json\` — which integration keys are configured (booleans only)
- \`system-stats.json\` — snapshot from GET /api/system/stats
- \`displays/<id>/\` — per-display status, hw stats, browser stats, console log
- \`logs/journalctl-home-screens.log\` — last 500 systemd journal lines
- \`plugins.json\` — installed plugin manifests
- \`telemetry-recent.json\` — recent anonymous telemetry
- \`errors-summary.txt\` — ERROR/WARN grep of journalctl

Displays included:
${displays}

${input.meta.truncated?.length ? `## Truncated\n\n${input.meta.truncated.map((t) => `- ${t}`).join('\n')}\n` : ''}`;
}

export function composeDiagnosticsBundle(input: BundleInput): Readable {
  const archive = archiver('zip', { zlib: { level: 9 } });

  // Archiver emits `error` for unrecoverable failures (back-pressure,
  // underlying stream death). Without a handler Node treats it as an
  // unhandledError event and can terminate the Next.js worker. We destroy
  // the stream with the error so the HTTP response aborts cleanly instead
  // of the route hanging forever.
  archive.on('error', (err) => {
    archive.destroy(err);
  });

  // `warning` fires for non-fatal conditions (e.g. file read soft-errors).
  // Swallow them — the in-memory inputs here don't generate real warnings,
  // but we don't want an unhandled listener either.
  archive.on('warning', () => {});

  archive.append(JSON.stringify(input.meta, null, 2),        { name: 'meta.json' });
  archive.append(JSON.stringify(input.redactedConfig, null, 2), { name: 'config-redacted.json' });
  archive.append(JSON.stringify(input.secretsStatus, null, 2), { name: 'secrets-status.json' });
  archive.append(JSON.stringify(input.systemStats, null, 2), { name: 'system-stats.json' });

  for (const d of input.displays) {
    // Render missing values as an empty object rather than the literal
    // string "null" — easier to scan when triaging a bundle and preserves
    // a valid JSON shape if a recipient parses the files programmatically.
    archive.append(JSON.stringify(d.status ?? {}, null, 2), { name: `displays/${d.id}/status.json` });
    archive.append(JSON.stringify(d.hwStats ?? {}, null, 2), { name: `displays/${d.id}/hw-stats.json` });
    archive.append(JSON.stringify(d.browserStats ?? {}, null, 2), { name: `displays/${d.id}/browser-stats.json` });
    const consoleText = d.consoleLog
      ? d.consoleLog.map((e) =>
          `${new Date(e.timestamp).toISOString()} [${e.level}] ${e.message}`,
        ).join('\n')
      : d.consoleLogNote ?? '[no console data]';
    archive.append(consoleText, { name: `displays/${d.id}/console.log` });
  }

  archive.append(input.journalctlText, { name: 'logs/journalctl-home-screens.log' });
  archive.append(JSON.stringify(input.plugins, null, 2), { name: 'plugins.json' });
  archive.append(JSON.stringify(input.telemetryRecent, null, 2), { name: 'telemetry-recent.json' });
  archive.append(input.errorsSummary, { name: 'errors-summary.txt' });
  archive.append(renderReadme(input), { name: 'README.md' });

  archive.finalize();
  return archive as unknown as Readable;
}
