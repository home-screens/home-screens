// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import type { ReactNode } from 'react';
import type { FamilyMember } from '@/types/family';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, TimetableConfig } from '@/types/config';

const state = vi.hoisted(() => ({
  members: [] as FamilyMember[],
  responses: new Map<string, unknown>(),
  updateModule: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/useFamilyData', () => ({
  useFamilyData: () => ({
    members: state.members,
    revision: 'r1',
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEditorData', () => ({
  useEditorData: (url: string | null) => ({
    data: url ? state.responses.get(url) ?? null : null,
    error: false,
    loading: false,
    refetch: state.refetch,
  }),
}));
// The real store is selector-based, so the stand-in has to be too: returning one
// object whatever was asked for handed every selector the same value.
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: (select?: (state: unknown) => unknown) => {
    const store = { updateModule: state.updateModule };
    return select ? select(store) : store;
  },
}));

import { TimetableConfigSection } from '../TimetableConfigSection';

/** The shipped dictionary, so every assertion below reads real wording. */
const editorDict = editor;

function person(id: string, name: string): FamilyMember {
  return {
    id,
    name,
    color: '#60a5fa',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

function timetablesFor(entries: { memberId: string; className?: string }[]) {
  return {
    data: {
      schools: [],
      subjects: [],
      timetables: entries.map((entry, index) => ({
        id: `tt-${index}`,
        memberId: entry.memberId,
        schoolId: 'school',
        className: entry.className,
        weeks: { A: {} },
      })),
    },
  };
}

function module(config: Partial<TimetableConfig>): ModuleInstance {
  return {
    id: 'mod-1',
    // The module type is registered in a later change; the section only reads
    // the instance's id and config, so any built-in type stands in here.
    type: 'text',
    position: { x: 0, y: 0 },
    size: { w: 400, h: 300 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: config as unknown as Record<string, unknown>,
  };
}

function render(mod: ModuleInstance, locale = 'en-US') {
  return renderUI(<TimetableConfigSection mod={mod} screenId="screen-1" />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider locale={locale} blob={{ core, editor: editorDict }}>{children}</I18nProvider>
    ),
  });
}

/** What the module's config would become after the last edit. */
function lastSavedConfig(): Partial<TimetableConfig> {
  const calls = state.updateModule.mock.calls;
  return calls[calls.length - 1][2].config as Partial<TimetableConfig>;
}

beforeEach(() => {
  state.members = [
    person('leon', 'Leon'),
    person('emma', 'Emma'),
    person('mia', 'Mia'),
    person('paul', 'Paul'),
    person('lina', 'Lina'),
  ];
  state.responses = new Map<string, unknown>([
    ['/api/timetables', timetablesFor([
      { memberId: 'leon', className: '7c' },
      { memberId: 'emma', className: '10a' },
      { memberId: 'mia', className: '4b' },
      { memberId: 'paul', className: 'Q1' },
    ])],
  ]);
  state.updateModule.mockReset();
  state.refetch.mockReset();
});
afterEach(cleanup);

describe('TimetableConfigSection roster', () => {
  it('lists the whole household in roster order, with each class', () => {
    render(module({ memberIds: ['leon', 'emma', 'mia'], layout: 'side-by-side', detail: 'less' }));

    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Show Leon', 'Show Emma', 'Show Mia', 'Show Paul',
    ]);
    expect(screen.getByText('7c')).toBeTruthy();
    expect(screen.getByText('Q1')).toBeTruthy();
    // Somebody left unticked is still on the list: unticked is not removed.
    expect((screen.getByRole('checkbox', { name: 'Show Paul' }) as HTMLInputElement).checked).toBe(false);
  });

  it('saves the people who are ticked in roster order', () => {
    render(module({ memberIds: ['paul'], layout: 'side-by-side', detail: 'some' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Emma' }));

    expect(state.updateModule).toHaveBeenCalledTimes(1);
    const [screenId, moduleId] = state.updateModule.mock.calls[0];
    expect(screenId).toBe('screen-1');
    expect(moduleId).toBe('mod-1');
    expect(lastSavedConfig().memberIds).toEqual(['emma', 'paul']);
  });

  it('drops a person from the list when their tick is cleared', () => {
    render(module({ memberIds: ['leon', 'emma'], layout: 'side-by-side', detail: 'some' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Leon' }));

    expect(lastSavedConfig().memberIds).toEqual(['emma']);
  });

  it('offers an add action instead of a tick for somebody with no timetable', () => {
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    expect(screen.queryByRole('checkbox', { name: 'Show Lina' })).toBeNull();
    const add = screen.getByRole('button', { name: 'Add a timetable for Lina' });
    expect(add.textContent).toBe('Add');
    expect(add.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(add);

    // The window opens on Lina, and on nobody else.
    expect(screen.getByRole('button', { name: 'Add a timetable for Lina' }).getAttribute('aria-expanded')).toBe('true');
    expect(state.updateModule).not.toHaveBeenCalled();
  });

  it('names the list of people so the tick boxes are read as one group', () => {
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    // The caption is the group's name: without this the tick boxes are five
    // loose checkboxes with no idea what they are choosing between.
    const group = screen.getByRole('group', { name: 'Whose week to show' });
    expect(group.querySelectorAll('input[type="checkbox"]').length).toBe(4);
  });

  it('keeps six rows of the household in view, with a fade at each edge', () => {
    // Five children and two grown-ups is seven rows. The cap used to be 12rem,
    // four rows and a sliver of a fifth, and on macOS, where the scrollbar
    // shows itself only while it is moving, that sliver was the only sign that
    // the rest of the family was below it.
    state.members = [...state.members, person('mum', 'Mum'), person('dad', 'Dad')];
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    const group = screen.getByRole('group', { name: 'Whose week to show' });
    expect(group.children.length).toBe(7);
    // Six rows of 44px each (12px of padding, a 16px name, a 15px class line
    // and a 1px divider), plus the 1px border above and below them, which the
    // max height counts inside itself.
    const maxHeight = Number.parseFloat(group.style.maxHeight);
    expect(maxHeight).toBe(266);
    expect(maxHeight).toBeGreaterThan(192);
    expect(group.className).not.toContain('max-h-');

    // The fades sit beside the scroller, not inside it, so they stay put while
    // it scrolls. They are the only sign there is more where the scrollbar
    // hides itself.
    const fades = [...(group.parentElement?.children ?? [])].filter((child) => child !== group);
    expect(fades).toHaveLength(2);
    for (const fade of fades) {
      expect((fade as HTMLElement).style.background).toContain('linear-gradient');
      expect(fade.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('points at the Family page as the one place people come from', () => {
    render(module({ memberIds: [], layout: 'side-by-side', detail: 'some' }));

    const link = screen.getByRole('link', { name: 'Manage family' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/editor/settings');
    expect(link.getAttribute('href')).toContain('family');
  });
});

describe('TimetableConfigSection first run', () => {
  beforeEach(() => { state.members = []; });

  it('explains where people come from and turns every other control off', () => {
    render(module({ memberIds: [], layout: 'side-by-side', detail: 'some' }));

    expect(screen.getByText(/Nobody is in Family yet/)).toBeTruthy();
    const open = screen.getByRole('link', { name: 'Manage family' });
    expect(open.getAttribute('href')).toContain('family');

    expect((screen.getByRole('button', { name: 'Edit timetables' }) as HTMLButtonElement).disabled).toBe(true);
    for (const name of ['Layout', 'Detail']) {
      const group = screen.getByRole('radiogroup', { name });
      expect(group.getAttribute('aria-disabled')).toBe('true');
      expect(group.className).toContain('opacity-50');
    }
    for (const name of ['Show start times', 'Show next week from Friday']) {
      expect((screen.getByRole('switch', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('still reports the layout and detail the module is set to', () => {
    render(module({ memberIds: [], layout: 'stacked', detail: 'more' }));

    expect(screen.getByRole('radio', { name: 'Stacked' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'More' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('TimetableConfigSection layout and detail', () => {
  it('saves the layout and detail a segment picks, and never swaps them itself', () => {
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    fireEvent.click(screen.getByRole('radio', { name: 'Stacked' }));
    expect(lastSavedConfig().layout).toBe('stacked');

    fireEvent.click(screen.getByRole('radio', { name: 'Less' }));
    expect(lastSavedConfig().detail).toBe('less');

    // The help under Detail is the same sentence whatever is picked, and it
    // says what each of the three levels shows.
    expect(screen.getByText(
      'Less shows short subject codes, Some adds full names and the room, More adds times, '
      + 'the week letter and what to pack. Less suits three or more kids side by side.',
    )).toBeTruthy();
  });

  it('leaves the heading to the one title picker above it', () => {
    // A second Show title switch and Heading box wrote two config fields the
    // module no longer has: the card title is what it draws.
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    expect(screen.queryByRole('switch', { name: 'Show title' })).toBeNull();
    expect(screen.queryByLabelText('Heading')).toBeNull();
  });
});

describe('TimetableConfigSection people who have left the household', () => {
  it('drops an id nobody on the roster owns the next time the picker is touched', () => {
    // Removing somebody from Family cleans the calendar's own settings and
    // nothing else, so their id sits in memberIds with no row to untick it
    // from: only people who exist get a row.
    render(module({ memberIds: ['leon', 'ghost'], layout: 'side-by-side', detail: 'some' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Emma' }));

    expect(lastSavedConfig().memberIds).toEqual(['leon', 'emma']);
  });
});

describe('TimetableConfigSection view', () => {
  it('switches between the Week and the Day view', () => {
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    const group = screen.getByRole('radiogroup', { name: 'View' });
    expect((group.querySelector('[aria-checked="true"]') as HTMLElement).textContent).toBe('Week');
    fireEvent.click(screen.getByRole('radio', { name: 'Day' }));

    expect(lastSavedConfig().view).toBe('day');
  });

  it('hides the week-only switches in the Day view and shows the switch time instead', () => {
    render(module({ memberIds: ['leon'], layout: 'stacked', detail: 'some', view: 'day' }));

    expect(screen.queryByRole('switch', { name: 'Show start times' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show next week from Friday' })).toBeNull();
    const time = screen.getByLabelText('Show tomorrow after') as HTMLInputElement;
    expect(time.type).toBe('time');
    // Unset, the field shows the default rather than an empty box.
    expect(time.value).toBe('16:00');
    expect(screen.getByText('Before this time the card shows today.')).toBeTruthy();
    expect(screen.getByText(/Stacked puts each kid on a row/)).toBeTruthy();

    fireEvent.change(time, { target: { value: '14:30' } });
    expect(lastSavedConfig().tomorrowFrom).toBe('14:30');

    // The line at the current time is on unless switched off, like the calendar's.
    const nowLine = screen.getByRole('switch', { name: 'Show a line at the current time' });
    expect(nowLine.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(nowLine);
    expect(lastSavedConfig().showNowLine).toBe(false);
  });

  it('keeps the week-only switches, and no switch time, in the Week view', () => {
    render(module({ memberIds: ['leon'], layout: 'side-by-side', detail: 'some' }));

    expect(screen.getByRole('switch', { name: 'Show start times' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show next week from Friday' })).toBeTruthy();
    expect(screen.queryByLabelText('Show tomorrow after')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Show a line at the current time' })).toBeNull();
    expect(screen.queryByText(/Stacked puts each kid on a row/)).toBeNull();
  });
});
