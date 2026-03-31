import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('uuid', () => {
  it('returns a valid v4 UUID format', async () => {
    const { uuid } = await import('../uuid');
    const id = uuid();
    // v4 UUID: 8-4-4-4-12 hex digits
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique values', async () => {
    const { uuid } = await import('../uuid');
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });

  it('uses crypto.randomUUID when available', async () => {
    const mockUUID = vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    vi.stubGlobal('crypto', {
      randomUUID: mockUUID,
      getRandomValues: vi.fn(),
    });

    vi.resetModules();
    const { uuid } = await import('../uuid');
    const result = uuid();
    expect(mockUUID).toHaveBeenCalled();
    expect(result).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

    vi.unstubAllGlobals();
  });

  it('falls back to getRandomValues when randomUUID is unavailable', async () => {
    const mockGetRandomValues = vi.fn((arr: Uint8Array) => {
      // Fill with predictable values
      for (let i = 0; i < arr.length; i++) arr[i] = i * 17;
      return arr;
    });
    vi.stubGlobal('crypto', {
      getRandomValues: mockGetRandomValues,
    });

    vi.resetModules();
    const { uuid } = await import('../uuid');
    const result = uuid();

    expect(mockGetRandomValues).toHaveBeenCalled();
    // Should still match UUID format
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    vi.unstubAllGlobals();
  });
});
