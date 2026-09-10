// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen, waitFor, within } from '@testing-library/react';
import dictionary from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { ReactNode } from 'react';
import type { ChoreDefinition } from '@/types/config';
import type { FamilySnapshot } from '@/hooks/useFamilyData';

const state = vi.hoisted(() => ({
  snapshot: { members: [], revision: 'r1' } as FamilySnapshot,
  request: vi.fn(),
}));
vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({ ...state.snapshot, loading: false, error: null, refresh: vi.fn() }),
  publishFamilyData: (next: FamilySnapshot) => { state.snapshot = next; },
}));
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: state.request }));
vi.mock('@/hooks/useFetchData', () => ({ useFetchData: () => [null, false, null] }));
import FamilyManager from '../FamilyManager';

function render(children: ReactNode) {
  return renderUI(children, { wrapper: ({ children }) => <I18nProvider locale="en-US" blob={{ core: dictionary, modules, remote }}>{children}</I18nProvider> });
}

function person(id: string, name = id) {
  return { id, name, color: '#60a5fa', createdAt: '2026-09-09T12:00:00.000Z', updatedAt: '2026-09-09T12:00:00.000Z' };
}

beforeEach(() => {
  state.snapshot = { members: [person('alex', 'Alex')], revision: 'r1' };
  state.request.mockReset();
});
afterEach(cleanup);

describe('FamilyManager safety', () => {
  it('uses the draft revision after a poll and shows a conflict without retrying', async () => {
    const { rerender } = render(<FamilyManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alicia' } });
    const current = { members: [person('alex', 'Alex'), person('sam', 'Sam')], revision: 'r2' };
    state.snapshot = current;
    rerender(<FamilyManager />);
    state.request.mockResolvedValue({ ok: false, status: 409, json: async () => current });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Please make your edit again'));
    const sent = JSON.parse(state.request.mock.calls[0][1].body);
    expect(sent.revision).toBe('r1');
    expect(sent.members.map((member: { name: string }) => member.name)).toEqual(['Alicia']);
    expect(sent.removedIds).toEqual([]);
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
  });

  it('names the deletion consequences and only submits exact removed IDs after confirmation', async () => {
    render(<FamilyManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alex?' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Remove Alex?' });
    expect(confirmation.textContent).toContain('completion history');
    expect(confirmation.textContent).toContain('ticket balance');
    expect(confirmation.textContent).toContain('which calendars are theirs');
    expect(state.request).not.toHaveBeenCalled();
    state.request.mockResolvedValue({ ok: true, json: async () => ({ members: [], revision: 'r2' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove person' }));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(state.request.mock.calls[0][1].body)).toEqual({ members: [], revision: 'r1', removedIds: ['alex'] });
  });

  it('shows the affected chore count once per chore and describes deletion of chores left unassigned', () => {
    const chore = (id: string, assigneeIds: string[], schedule?: Record<string, number[]>): ChoreDefinition => ({
      id, name: id, emoji: '', points: 1, frequency: 'daily', daysOfWeek: [], timeOfDay: 'anytime', rotation: 'fixed', assigneeIds, schedule,
    });
    render(<FamilyManager chores={[chore('shared', ['alex', 'sam'], { alex: [1], sam: [2] }), chore('only-alex', ['alex']), chore('sam', ['sam'])]} />);
    expect(screen.getByText('2 chores')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alex?' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Alex is assigned to 2 chores.');
    expect(screen.getByRole('alertdialog').textContent).toContain('Chores with no one left are deleted.');
  });

  it('edits a migrated Lucide avatar through the curated picker without showing its stored identifier', async () => {
    state.snapshot.members[0].emoji = 'lucide:crown';
    render(<FamilyManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex' }));
    expect((screen.getByLabelText('Emoji (optional)') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Cat' }));
    state.request.mockResolvedValue({ ok: true, json: async () => state.snapshot });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(state.request.mock.calls[0][1].body).members[0].emoji).toBe('lucide:cat');
  });

  it('uses the phone form, offers curated icons and color swatches, and confirms discarding edits', () => {
    state.snapshot.members[0].emoji = 'lucide:crown';
    render(<FamilyManager variant="mobile" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex' }));
    expect(screen.getByRole('dialog', { name: 'Edit person' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Icon: Royal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cat' }));
    expect(screen.getByRole('button', { name: 'Icon: Cat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Color: #fbbf24' }));
    expect(screen.getByRole('button', { name: 'Color: #fbbf24' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(remote.formOverlay.discard.title)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: remote.formOverlay.discard.keepEditing }));
    expect(screen.getByRole('button', { name: 'Icon: Cat' })).toBeTruthy();
    expect(state.request).not.toHaveBeenCalled();
  });

  it('preserves an unchanged grandfathered long name during a color edit', async () => {
    const legacyName = `  ${'Legacy name '.repeat(5)}  `;
    state.snapshot = { members: [person('legacy', legacyName)], revision: 'r1' };
    render(<FamilyManager />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit\s+Legacy name/ }));
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#fbbf24' } });
    state.request.mockResolvedValue({ ok: true, json: async () => state.snapshot });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(state.request.mock.calls[0][1].body).members[0]).toMatchObject({ name: legacyName, color: '#fbbf24' });
  });

  it('keeps a failed save visible inside the phone form and retains the draft', async () => {
    render(<FamilyManager variant="mobile" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Alex' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alicia' } });
    state.request.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Could not save your family.' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'Edit person' })).getByRole('status').textContent).toBe('Could not save your family.'));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Alicia');
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(false);
  });

  it('lets an oversized migrated roster reach and edit its final member while disabling additions', async () => {
    state.snapshot = { members: Array.from({ length: 65 }, (_, index) => person(`member-${index + 1}`)), revision: 'large' };
    render(<FamilyManager />);
    expect(screen.getByRole('button', { name: 'Add person' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByTestId('family-member')).toHaveLength(12);
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 6 of 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit member-65' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed final member' } });
    state.request.mockResolvedValue({ ok: true, json: async () => state.snapshot });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(state.request.mock.calls[0][1].body);
    expect(sent.members).toHaveLength(65);
    expect(sent.members[64].name).toBe('Renamed final member');
    expect(sent.removedIds).toEqual([]);
  });
});
