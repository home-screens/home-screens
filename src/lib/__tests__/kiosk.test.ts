import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

// kiosk.conf is sourced by the boot scripts, so it is written whole or not at
// all, through the same durable writer the data stores use.
vi.mock('@/lib/data-transaction', () => ({
  durableWriteFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// The install's own path, which is not the working directory after an update
// has swapped the release trees.
vi.mock('@/lib/app-dir', () => ({
  appScriptPath: (...segments: string[]) => ['/opt/home-screens/current/scripts', ...segments].join('/'),
}));

vi.mock('@/lib/data-root', () => ({
  getDataRoot: () => '/opt/home-screens/current',
}));

import { durableWriteFile } from '@/lib/data-transaction';
import { syncKioskConf, applyDisplaySettings } from '../kiosk';

function makeConfig(overrides: Partial<ScreenConfiguration['settings']> = {}, rawOverrides: Record<string, unknown> = {}): ScreenConfiguration {
  return {
    screens: [],
    settings: {
      displayWidth: 1080,
      displayHeight: 1920,
      displayTransform: 'normal',
      ...overrides,
    },
    ...rawOverrides,
  } as unknown as ScreenConfiguration;
}

describe('syncKioskConf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file doesn't exist yet
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(durableWriteFile).mockResolvedValue();
  });

  it('writes display mode with max dimension first (landscape format)', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 1080, displayHeight: 1920 }));

    expect(durableWriteFile).toHaveBeenCalledOnce();
    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_MODE="1920x1080"');
  });

  it('writes display mode with dimensions already in landscape order', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 1920, displayHeight: 1080 }));

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_MODE="1920x1080"');
  });

  it('includes transform when not normal', async () => {
    await syncKioskConf(makeConfig({ displayTransform: '90' as never }));

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_TRANSFORM="90"');
  });

  it('omits transform when set to normal', async () => {
    await syncKioskConf(makeConfig({ displayTransform: 'normal' }));

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_TRANSFORM');
  });

  it('omits transform when undefined', async () => {
    await syncKioskConf(makeConfig({ displayTransform: undefined }));

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_TRANSFORM');
  });

  it('includes piVariant when valid alphanumeric-dash string', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'pi-5' } });
    await syncKioskConf(config);

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).toContain('PI_VARIANT="pi-5"');
  });

  it('rejects piVariant with shell injection characters', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'pi; rm -rf /' } });
    await syncKioskConf(config);

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
    expect(content).not.toContain('rm -rf');
  });

  it('rejects piVariant with backtick injection', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: '`whoami`' } });
    await syncKioskConf(config);

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
  });

  it('rejects piVariant with uppercase letters', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'Pi5' } });
    await syncKioskConf(config);

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
  });

  it('skips write when content is unchanged', async () => {
    const config = makeConfig({ displayWidth: 1080, displayHeight: 1920 });
    vi.mocked(fs.readFile).mockResolvedValue('DISPLAY_MODE="1920x1080"\n');

    await syncKioskConf(config);

    expect(durableWriteFile).not.toHaveBeenCalled();
  });

  it('writes when content differs from existing file', async () => {
    const config = makeConfig({ displayWidth: 1080, displayHeight: 1920 });
    vi.mocked(fs.readFile).mockResolvedValue('DISPLAY_MODE="1280x720"\n');

    await syncKioskConf(config);

    expect(durableWriteFile).toHaveBeenCalledOnce();
  });

  it('omits display mode when dimensions are zero', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 0, displayHeight: 0 }));

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_MODE');
  });

  it('output ends with newline', async () => {
    await syncKioskConf(makeConfig());

    const content = vi.mocked(durableWriteFile).mock.calls[0][1] as string;
    expect(content.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyDisplaySettings
// ---------------------------------------------------------------------------
describe('applyDisplaySettings', () => {
  const mockExecFile = vi.mocked(execFile);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  type Callback = (err: Error | null, stdout?: string, stderr?: string) => void;

  /** Simulate execFile — call (cmd, args, opts, callback) */
  function mockExec(result: Error | null = null) {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as Callback)(result, '', '');
      return {} as ReturnType<typeof execFile>;
    });
  }

  it('hands the screen settings to kiosk-outputs.sh apply', async () => {
    mockExec();

    expect(await applyDisplaySettings()).toBe(true);

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [cmd, args, opts] = mockExecFile.mock.calls[0] as unknown as [string, string[], { timeout: number }];
    expect(cmd).toBe('bash');
    expect(args).toEqual(['/opt/home-screens/current/scripts/kiosk-outputs.sh', 'apply']);
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it('never runs wlr-randr itself', async () => {
    mockExec();

    await applyDisplaySettings();

    const commands = mockExecFile.mock.calls.map((c) => c[0]);
    expect(commands).not.toContain('wlr-randr');
  });

  it('resolves false when the script fails', async () => {
    mockExec(new Error('exit 1'));

    expect(await applyDisplaySettings()).toBe(false);
  });

  it('resolves true when the script found no kiosk session to set (a laptop, Docker)', async () => {
    mockExec(Object.assign(new Error('exit 3'), { code: 3 }));

    expect(await applyDisplaySettings()).toBe(true);
  });

  it('runs one apply at a time, in the order they were asked for', async () => {
    const pending: Callback[] = [];
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      pending.push(cb as Callback);
      return {} as ReturnType<typeof execFile>;
    });

    const first = applyDisplaySettings();
    const second = applyDisplaySettings();
    await Promise.resolve();
    await Promise.resolve();
    // The second save waits for the first script run to finish.
    expect(pending).toHaveLength(1);

    pending[0](null);
    expect(await first).toBe(true);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1](new Error('boom'));
    expect(await second).toBe(false);
  });

  it('keeps going after a failed apply', async () => {
    mockExec(new Error('exit 1'));
    expect(await applyDisplaySettings()).toBe(false);
    mockExec();
    expect(await applyDisplaySettings()).toBe(true);
  });
});
