import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

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
    vi.mocked(fs.writeFile).mockResolvedValue();
  });

  it('writes display mode with max dimension first (landscape format)', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 1080, displayHeight: 1920 }));

    expect(fs.writeFile).toHaveBeenCalledOnce();
    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_MODE="1920x1080"');
  });

  it('writes display mode with dimensions already in landscape order', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 1920, displayHeight: 1080 }));

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_MODE="1920x1080"');
  });

  it('includes transform when not normal', async () => {
    await syncKioskConf(makeConfig({ displayTransform: '90' as never }));

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).toContain('DISPLAY_TRANSFORM="90"');
  });

  it('omits transform when set to normal', async () => {
    await syncKioskConf(makeConfig({ displayTransform: 'normal' }));

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_TRANSFORM');
  });

  it('omits transform when undefined', async () => {
    await syncKioskConf(makeConfig({ displayTransform: undefined }));

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_TRANSFORM');
  });

  it('includes piVariant when valid alphanumeric-dash string', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'pi-5' } });
    await syncKioskConf(config);

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).toContain('PI_VARIANT="pi-5"');
  });

  it('rejects piVariant with shell injection characters', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'pi; rm -rf /' } });
    await syncKioskConf(config);

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
    expect(content).not.toContain('rm -rf');
  });

  it('rejects piVariant with backtick injection', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: '`whoami`' } });
    await syncKioskConf(config);

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
  });

  it('rejects piVariant with uppercase letters', async () => {
    const config = makeConfig({}, { settings: { displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal', piVariant: 'Pi5' } });
    await syncKioskConf(config);

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('PI_VARIANT');
  });

  it('skips write when content is unchanged', async () => {
    const config = makeConfig({ displayWidth: 1080, displayHeight: 1920 });
    vi.mocked(fs.readFile).mockResolvedValue('DISPLAY_MODE="1920x1080"\n');

    await syncKioskConf(config);

    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('writes when content differs from existing file', async () => {
    const config = makeConfig({ displayWidth: 1080, displayHeight: 1920 });
    vi.mocked(fs.readFile).mockResolvedValue('DISPLAY_MODE="1280x720"\n');

    await syncKioskConf(config);

    expect(fs.writeFile).toHaveBeenCalledOnce();
  });

  it('omits display mode when dimensions are zero', async () => {
    await syncKioskConf(makeConfig({ displayWidth: 0, displayHeight: 0 }));

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(content).not.toContain('DISPLAY_MODE');
  });

  it('output ends with newline', async () => {
    await syncKioskConf(makeConfig());

    const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
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

  /** Simulate execFile — call (cmd, args, opts, callback) */
  function mockExecSuccess(stdout = '') {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as Function)(null, stdout, '');
      return {} as ReturnType<typeof execFile>;
    });
  }

  function mockExecFailure(err = new Error('command failed')) {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as Function)(err, '', '');
      return {} as ReturnType<typeof execFile>;
    });
  }

  it('detects output name from wlr-randr and applies transform', async () => {
    // First call: detectOutput (wlr-randr with no args)
    // Subsequent calls: wlr-randr --output ...
    let callIndex = 0;
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      callIndex++;
      const argArr = args as string[];
      if (argArr.length === 0) {
        // detectOutput — return a display name
        (cb as Function)(null, 'HDMI-A-2 (some info)\n', '');
      } else {
        // wlr-randr --output ... — success
        (cb as Function)(null, '', '');
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await applyDisplaySettings(makeConfig({ displayTransform: '90' as never }));
    expect(result).toBe(true);

    // Should have called wlr-randr with the detected output
    const transformCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--transform');
    });
    expect(transformCall).toBeDefined();
    expect((transformCall![1] as string[])).toContain('HDMI-A-2');
    expect((transformCall![1] as string[])).toContain('90');
  });

  it('falls back to HDMI-A-1 when wlr-randr detection fails', async () => {
    let callIndex = 0;
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      callIndex++;
      const argArr = args as string[];
      if (argArr.length === 0) {
        // detectOutput fails
        (cb as Function)(new Error('not found'), '', '');
      } else {
        (cb as Function)(null, '', '');
      }
      return {} as ReturnType<typeof execFile>;
    });

    await applyDisplaySettings(makeConfig());

    // Should have used HDMI-A-1 as fallback
    const transformCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--transform');
    });
    expect(transformCall).toBeDefined();
    expect((transformCall![1] as string[])).toContain('HDMI-A-1');
  });

  it('applies normal transform when displayTransform is unset', async () => {
    mockExecSuccess('HDMI-A-1\n');

    await applyDisplaySettings(makeConfig({ displayTransform: undefined }));

    const transformCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--transform');
    });
    expect(transformCall).toBeDefined();
    expect((transformCall![1] as string[])).toContain('normal');
  });

  it('applies display mode with max dimension first', async () => {
    mockExecSuccess('HDMI-A-1\n');

    await applyDisplaySettings(makeConfig({ displayWidth: 1080, displayHeight: 1920 }));

    const modeCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--mode');
    });
    expect(modeCall).toBeDefined();
    expect((modeCall![1] as string[])).toContain('1920x1080');
  });

  it('tries --custom-mode when --mode fails', async () => {
    let callCount = 0;
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      callCount++;
      const argArr = args as string[];
      if (argArr.includes('--mode')) {
        // Mode fails (not in EDID)
        (cb as Function)(new Error('mode not available'), '', '');
      } else {
        (cb as Function)(null, 'HDMI-A-1\n', '');
      }
      return {} as ReturnType<typeof execFile>;
    });

    await applyDisplaySettings(makeConfig({ displayWidth: 1080, displayHeight: 1920 }));

    const customModeCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--custom-mode');
    });
    expect(customModeCall).toBeDefined();
  });

  it('skips mode application when dimensions are zero', async () => {
    mockExecSuccess('HDMI-A-1\n');

    await applyDisplaySettings(makeConfig({ displayWidth: 0, displayHeight: 0 }));

    const modeCall = mockExecFile.mock.calls.find((c) => {
      const args = c[1] as string[];
      return args.includes('--mode') || args.includes('--custom-mode');
    });
    expect(modeCall).toBeUndefined();
  });

  it('returns false when transform command fails', async () => {
    let callIndex = 0;
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      const argArr = args as string[];
      if (argArr.length === 0) {
        (cb as Function)(null, 'HDMI-A-1\n', '');
      } else if (argArr.includes('--transform')) {
        (cb as Function)(new Error('transform failed'), '', '');
      } else {
        (cb as Function)(null, '', '');
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await applyDisplaySettings(makeConfig({ displayWidth: 0, displayHeight: 0 }));
    expect(result).toBe(false);
  });

  it('serializes concurrent calls', async () => {
    const callOrder: string[] = [];
    mockExecFile.mockImplementation((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
      const argArr = args as string[];
      if (argArr.includes('--transform')) {
        callOrder.push(argArr[argArr.indexOf('--transform') + 1]);
      }
      (cb as Function)(null, 'HDMI-A-1\n', '');
      return {} as ReturnType<typeof execFile>;
    });

    const p1 = applyDisplaySettings(makeConfig({ displayTransform: '90' as never, displayWidth: 0, displayHeight: 0 }));
    const p2 = applyDisplaySettings(makeConfig({ displayTransform: '180' as never, displayWidth: 0, displayHeight: 0 }));

    await Promise.all([p1, p2]);

    // Both transforms should have been applied in order
    expect(callOrder).toContain('90');
    expect(callOrder).toContain('180');
    expect(callOrder.indexOf('90')).toBeLessThan(callOrder.indexOf('180'));
  });
});
