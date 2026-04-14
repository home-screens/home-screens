import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchDisplayCommand } from '@/lib/display-dispatch';

describe('dispatchDisplayCommand', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it('dispatches next-screen with no target to the legacy queue', async () => {
    await dispatchDisplayCommand(undefined, 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.objectContaining({ method: 'GET' }));
  });

  it('dispatches to all displays when target is "all"', async () => {
    await dispatchDisplayCommand('all', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen?display=all', expect.any(Object));
  });

  it('dispatches to a specific display id', async () => {
    await dispatchDisplayCommand('kitchen', 'sleep');
    expect(fetch).toHaveBeenCalledWith('/api/display/sleep?display=kitchen', expect.any(Object));
  });

  it('includes brightness value in the query string', async () => {
    await dispatchDisplayCommand('kitchen', 'brightness', { value: 42 });
    expect(fetch).toHaveBeenCalledWith('/api/display/brightness?display=kitchen&value=42', expect.any(Object));
  });

  it('treats "self" as unresolved and omits the display param', async () => {
    await dispatchDisplayCommand('self', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.any(Object));
  });

  it('swallows fetch rejections without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(dispatchDisplayCommand('kitchen', 'sleep')).resolves.toBeUndefined();
  });

  it('skips dispatch when target is an empty string', async () => {
    await dispatchDisplayCommand('', 'next-screen');
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen', expect.any(Object));
  });
});
