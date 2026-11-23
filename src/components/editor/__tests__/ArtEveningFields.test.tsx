// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

const updateScreen = vi.hoisted(() => vi.fn());
vi.mock('@/stores/editor-store', () => ({ useEditorStore: (pick: (state: { updateScreen: typeof updateScreen }) => unknown) => pick({ updateScreen }) }));

import EveningLightFields from '../EveningLightFields';
import ArtModeFields from '../ArtModeFields';

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>{ui}</I18nProvider>;
beforeEach(() => updateScreen.mockReset());
afterEach(cleanup);

describe('EveningLightFields', () => {
  it('switches on from sunset until morning, and off again', () => {
    const view = render(wrap(<EveningLightFields screenId="s1" />));
    expect(screen.queryByText('From')).toBeNull();
    fireEvent.click(screen.getByRole('switch'));
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { eveningLight: { from: 'sunset', until: '07:00' } });
    view.unmount();

    render(wrap(<EveningLightFields screenId="s1" eveningLight={{ from: 'sunset', until: '07:00' }} />));
    expect(screen.getByText('Sunset needs your town in Settings > Location & language. Without it, evening starts at 8 PM.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { eveningLight: undefined });
  });

  it('takes a set time in place of sunset, and a new morning time', () => {
    const view = render(wrap(<EveningLightFields screenId="s1" eveningLight={{ from: 'sunset', until: '07:00' }} />));
    fireEvent.change(screen.getByDisplayValue('Sunset'), { target: { value: 'time' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { eveningLight: { from: '20:00', until: '07:00' } });
    view.unmount();

    render(wrap(<EveningLightFields screenId="s1" eveningLight={{ from: '20:00', until: '07:00' }} />));
    fireEvent.change(screen.getByLabelText('A set time', { selector: 'input' }), { target: { value: '18:30' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { eveningLight: { from: '18:30', until: '07:00' } });
    fireEvent.change(screen.getByLabelText('Until', { selector: 'input' }), { target: { value: '06:15' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { eveningLight: { from: '20:00', until: '06:15' } });
  });
});

describe('ArtModeFields', () => {
  it('switches on for always, takes hours when asked, and switches off', () => {
    const view = render(wrap(<ArtModeFields screenId="s1" />));
    fireEvent.click(screen.getByRole('switch'));
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: {} });
    view.unmount();

    const always = render(wrap(<ArtModeFields screenId="s1" artMode={{}} />));
    expect(screen.queryByLabelText('From')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('Always'), { target: { value: 'hours' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { from: '21:00', until: '07:00' } });
    always.unmount();

    render(wrap(<ArtModeFields screenId="s1" artMode={{ from: '21:00', until: '07:00' }} />));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '22:30' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { from: '22:30', until: '07:00' } });
    fireEvent.change(screen.getByDisplayValue('Between two times'), { target: { value: 'always' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: {} });
    fireEvent.click(screen.getByRole('switch', { name: 'Art mode' }));
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: undefined });
  });

  it('offers to hide the screen dots once art mode is on, and keeps that choice when the hours change', () => {
    const off = render(wrap(<ArtModeFields screenId="s1" />));
    expect(screen.queryByRole('switch', { name: 'Hide screen dots' })).toBeNull();
    off.unmount();

    const always = render(wrap(<ArtModeFields screenId="s1" artMode={{}} />));
    const dots = screen.getByRole('switch', { name: 'Hide screen dots' });
    expect(dots.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(dots);
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { hideDots: true } });
    always.unmount();

    const hidden = render(wrap(<ArtModeFields screenId="s1" artMode={{ hideDots: true }} />));
    expect(screen.getByRole('switch', { name: 'Hide screen dots' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByDisplayValue('Always'), { target: { value: 'hours' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { from: '21:00', until: '07:00', hideDots: true } });
    hidden.unmount();

    render(wrap(<ArtModeFields screenId="s1" artMode={{ from: '21:00', until: '07:00', hideDots: true }} />));
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '06:00' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { from: '21:00', until: '06:00', hideDots: true } });
    fireEvent.change(screen.getByDisplayValue('Between two times'), { target: { value: 'always' } });
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { hideDots: true } });
    fireEvent.click(screen.getByRole('switch', { name: 'Hide screen dots' }));
    expect(updateScreen).toHaveBeenLastCalledWith('s1', { artMode: { from: '21:00', until: '07:00' } });
  });
});
