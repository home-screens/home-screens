// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { FamilyMember } from '@/types/family';
import type { ChoreWriteOutcome } from '@/lib/chore-client';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import enUSModules from '@/translations/en-US/modules.json';
import { CHORE_WRITE_ALERT_MS, useChoreWriteAlert } from '../useChoreWriteAlert';

const esme: FamilyMember = { id: 'esme', name: 'Esme', emoji: '', color: '#8b5cf6', createdAt: '', updatedAt: '' };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="en-US" blob={{ core: enUSCore, modules: enUSModules }}>{children}</I18nProvider>
);
const lost = { ok: false, refused: false } as ChoreWriteOutcome;
const went = { ok: true, changed: true, answer: {} } as ChoreWriteOutcome;
const refused = (refusal: string, memberId?: string) => ({ ok: false, refused: true, refusal, memberId, marks: null }) as unknown as ChoreWriteOutcome;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('useChoreWriteAlert', () => {
  it('says a tick did not save when the hub could not be reached', () => {
    const { result } = renderHook(() => useChoreWriteAlert([esme]), { wrapper });
    act(() => result.current.report(lost));
    expect(result.current.alert).toEqual({ text: "That didn't save. Try again.", bonus: false });
  });

  it('names who has a bonus chore the hub refused', () => {
    const { result } = renderHook(() => useChoreWriteAlert([esme]), { wrapper });
    act(() => result.current.report(refused('grabbed', 'esme')));
    expect(result.current.alert?.bonus).toBe(true);
    expect(result.current.alert?.text).toContain('Esme');
  });

  it('falls back to plain bonus words when it cannot say who', () => {
    const { result } = renderHook(() => useChoreWriteAlert([esme]), { wrapper });
    act(() => result.current.report(refused('grabbed', 'someone-gone')));
    expect(result.current.alert).toEqual({ text: enUSModules['chore-chart'].bonus.refused.other, bonus: true });
  });

  it('clears on a write that went through, and on its own after a few seconds', () => {
    const { result } = renderHook(() => useChoreWriteAlert([esme]), { wrapper });
    act(() => result.current.report(lost));
    act(() => result.current.report(went));
    expect(result.current.alert).toBeNull();

    act(() => result.current.report(lost));
    act(() => { vi.advanceTimersByTime(CHORE_WRITE_ALERT_MS); });
    expect(result.current.alert).toBeNull();
  });
});
