import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
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

import { syncKioskConf } from '../kiosk';

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
