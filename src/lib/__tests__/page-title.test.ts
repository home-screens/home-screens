import { describe, it, expect, vi, beforeEach } from 'vitest';

const readConfig = vi.fn();
vi.mock('@/lib/config', () => ({ readConfig: () => readConfig() }));

import { pageMetadata, pageTitle } from '@/lib/page-title';

describe('pageTitle', () => {
  beforeEach(() => {
    readConfig.mockReset();
  });

  it('names each page in English by default', async () => {
    readConfig.mockResolvedValue({ settings: {} });
    expect(await pageTitle('remote')).toBe('Family remote');
    expect(await pageTitle('chores')).toBe("Kids' chores");
    expect(await pageTitle('editor')).toBe('Editor');
    expect(await pageTitle('signIn')).toBe('Sign in');
  });

  it('reads the saved locale', async () => {
    readConfig.mockResolvedValue({ settings: { locale: 'de-DE' } });
    expect(await pageTitle('remote')).not.toBe('Family remote');
  });

  it('falls back to English for a key the locale has not translated yet', async () => {
    readConfig.mockResolvedValue({ settings: { locale: 'xx-YY' } });
    expect(await pageTitle('signIn')).toBe('Sign in');
  });

  it('still names the page when the config cannot be read', async () => {
    readConfig.mockRejectedValue(new Error('gone'));
    expect(await pageMetadata('chores')).toEqual({ title: "Kids' chores" });
  });
});
