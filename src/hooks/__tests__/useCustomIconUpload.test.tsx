// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  uploadCustomIcon: vi.fn(),
  deleteCustomIcon: vi.fn(async () => {}),
  renameCustomIcon: vi.fn(),
  keepCustomIcon: vi.fn(async (id: string, name: string) => ({ id, name })),
  cropCustomIcon: vi.fn(),
}));

vi.mock('../useCustomIcons', () => ({
  ...api,
  CustomIconRequestError: class extends Error {},
}));
vi.mock('@/lib/editor-fetch', () => ({ isSessionExpired: () => false }));

import { useCustomIconUpload } from '../useCustomIconUpload';

const ICON = { id: 'abcdefghijkl', name: 'cake', hash: 'a'.repeat(32), bytes: 10, animated: false, createdAt: '', updatedAt: '', url: '/x' };
const file = () => new File(['x'], 'cake.png', { type: 'image/png' });

const fresh = { icon: ICON, existing: false };

beforeEach(() => {
  api.uploadCustomIcon.mockReset();
  api.deleteCustomIcon.mockClear();
  api.renameCustomIcon.mockReset();
  api.keepCustomIcon.mockClear();
  document.body.innerHTML = '';
});

describe('useCustomIconUpload', () => {
  it('removes a picture left in review when the picker goes away', async () => {
    api.uploadCustomIcon.mockResolvedValue(fresh);
    const { result, unmount } = renderHook(() => useCustomIconUpload(() => {}));
    await act(async () => { await result.current.upload(file()); });
    expect(result.current.state.step).toBe('review');
    unmount();
    expect(api.deleteCustomIcon).toHaveBeenCalledWith(ICON.id);
  });

  it('removes a picture whose upload finishes after the picker went away', async () => {
    let finish!: (result: typeof fresh) => void;
    api.uploadCustomIcon.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useCustomIconUpload(() => {}));
    let pending!: Promise<void>;
    act(() => { pending = result.current.upload(file()); });
    unmount();
    expect(api.deleteCustomIcon).not.toHaveBeenCalled();
    await act(async () => { finish(fresh); await pending; });
    expect(api.deleteCustomIcon).toHaveBeenCalledWith(ICON.id);
  });

  it('keeps a picture once it is used', async () => {
    api.uploadCustomIcon.mockResolvedValue(fresh);
    const onUse = vi.fn();
    const { result, unmount } = renderHook(() => useCustomIconUpload(onUse));
    await act(async () => { await result.current.upload(file()); });
    await act(async () => { await result.current.confirm(); });
    expect(api.keepCustomIcon).toHaveBeenCalledWith(ICON.id, ICON.name);
    expect(onUse).toHaveBeenCalledWith({ id: ICON.id, name: ICON.name });
    unmount();
    expect(api.deleteCustomIcon).not.toHaveBeenCalled();
  });

  it('removes the earlier picture when another is chosen during review', async () => {
    api.uploadCustomIcon.mockResolvedValueOnce(fresh).mockResolvedValueOnce({ icon: { ...ICON, id: 'bbbbbbbbbbbb' }, existing: false });
    const { result } = renderHook(() => useCustomIconUpload(() => {}));
    await act(async () => { await result.current.upload(file()); });
    await act(async () => { await result.current.upload(file()); });
    expect(api.deleteCustomIcon).toHaveBeenCalledTimes(1);
    expect(api.deleteCustomIcon).toHaveBeenCalledWith(ICON.id);
  });

  it('never removes a picture the library already had', async () => {
    api.uploadCustomIcon.mockResolvedValue({ icon: ICON, existing: true });
    const { result, unmount } = renderHook(() => useCustomIconUpload(() => {}));
    await act(async () => { await result.current.upload(file()); });
    act(() => { result.current.cancel(); });
    unmount();
    expect(api.deleteCustomIcon).not.toHaveBeenCalled();
  });

  it('starts a new picture from the name of what it is for', async () => {
    api.uploadCustomIcon.mockResolvedValue(fresh);
    const { result } = renderHook(() => useCustomIconUpload(() => {}, { suggestedName: "Grandma's lasagna" }));
    await act(async () => { await result.current.upload(new File(['x'], 'IMG_4821.jpg', { type: 'image/jpeg' })); });
    expect(api.uploadCustomIcon).toHaveBeenCalledWith(expect.any(File), "Grandma's lasagna");
  });

  it('swallows the second tap of a double tap on "Use this icon"', async () => {
    vi.useFakeTimers();
    api.uploadCustomIcon.mockResolvedValue(fresh);
    const { result } = renderHook(() => useCustomIconUpload(() => {}));
    await act(async () => { await result.current.upload(file()); });
    await act(async () => { await result.current.confirm(); });
    const shield = [...document.body.children].find((el) => (el as HTMLElement).style.position === 'fixed');
    expect(shield).toBeTruthy();
    act(() => { vi.advanceTimersByTime(400); });
    expect(shield!.isConnected).toBe(false);
    vi.useRealTimers();
  });

  it('never removes a picture whose keep was on its way when the picker closed', async () => {
    api.uploadCustomIcon.mockResolvedValue(fresh);
    let answer!: (icon: { id: string; name: string }) => void;
    api.keepCustomIcon.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const onUse = vi.fn();
    const { result, unmount } = renderHook(() => useCustomIconUpload(onUse));
    await act(async () => { await result.current.upload(file()); });
    let keeping!: Promise<void>;
    act(() => { keeping = result.current.confirm(); });
    // The hub may already have kept it; closing now must not delete it.
    unmount();
    expect(api.deleteCustomIcon).not.toHaveBeenCalled();
    await act(async () => { answer({ id: ICON.id, name: ICON.name }); await keeping; });
    expect(api.deleteCustomIcon).not.toHaveBeenCalled();
    // Nothing is picked behind the back of a picker that is gone.
    expect(onUse).not.toHaveBeenCalled();
  });
});
