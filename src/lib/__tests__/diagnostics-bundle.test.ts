import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { composeDiagnosticsBundle, type BundleInput } from '@/lib/diagnostics-bundle';

async function collectZipEntries(stream: Readable): Promise<Set<string>> {
  // Minimal ZIP-central-directory parse: we look for 0x02014b50 markers
  // and read the file-name length + name that follows. This avoids adding
  // unzip as a test dependency.
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const buf = Buffer.concat(chunks);
  const entries = new Set<string>();
  const SIG = 0x02014b50;
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === SIG) {
      const nameLen = buf.readUInt16LE(i + 28);
      const name = buf.slice(i + 46, i + 46 + nameLen).toString('utf8');
      entries.add(name);
      i += 45 + nameLen;
    }
  }
  return entries;
}

function minimalInput(): BundleInput {
  return {
    meta: { version: '1.2.0', generatedAt: '2026-04-17T12:00:00Z', node: 'v22.0.0', platform: 'darwin' },
    redactedConfig: { version: 1, settings: {}, screens: [] } as never,
    secretsStatus: { openweathermap_key: true, weatherapi_key: false },
    systemStats: { disk: {}, os: {}, memory: {}, app: {} } as never,
    displays: [
      {
        id: 'main',
        status: null,
        hwStats: null,
        browserStats: null,
        consoleLog: null,
        consoleLogNote: '[timeout] Display did not respond within 5s',
      },
      {
        id: 'kitchen',
        status: { currentScreen: { index: 0, id: 's1', name: 'S1' }, screenCount: 1,
                  activeProfile: null, displayState: 'active', timestamp: Date.now() },
        hwStats: null, browserStats: null,
        consoleLog: [{ level: 'error', message: 'boom', timestamp: Date.now() }],
        consoleLogNote: null,
      },
    ],
    journalctlText: 'Apr 17 12:00:00 myhost home-screens[1]: started',
    plugins: [{ id: 'standings', version: '0.1.0', manifestExcerpt: { id: 'standings' } }],
    telemetryRecent: { installId: 'abc...', lastBeaconAt: '2026-04-16T00:00:00Z' },
    errorsSummary: 'No ERROR lines in last 500 journal entries.\n',
  };
}

describe('composeDiagnosticsBundle', () => {
  it('includes every top-level file listed in the spec', async () => {
    const stream = composeDiagnosticsBundle(minimalInput());
    const entries = await collectZipEntries(stream);
    expect(entries).toContain('meta.json');
    expect(entries).toContain('config-redacted.json');
    expect(entries).toContain('secrets-status.json');
    expect(entries).toContain('system-stats.json');
    expect(entries).toContain('logs/journalctl-home-screens.log');
    expect(entries).toContain('plugins.json');
    expect(entries).toContain('telemetry-recent.json');
    expect(entries).toContain('errors-summary.txt');
    expect(entries).toContain('README.md');
  });

  it('emits one subdirectory per display with status/hw/browser/console files', async () => {
    const stream = composeDiagnosticsBundle(minimalInput());
    const entries = await collectZipEntries(stream);
    expect(entries).toContain('displays/main/status.json');
    expect(entries).toContain('displays/main/hw-stats.json');
    expect(entries).toContain('displays/main/browser-stats.json');
    expect(entries).toContain('displays/main/console.log');
    expect(entries).toContain('displays/kitchen/status.json');
    expect(entries).toContain('displays/kitchen/console.log');
  });
});
