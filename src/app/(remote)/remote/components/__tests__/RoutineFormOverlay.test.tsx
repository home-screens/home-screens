// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import type { Routine } from '@/types/timers';
import RoutineFormOverlay from '../RoutineFormOverlay';

function render(children: ReactNode) {
  return renderUI(children, {
    wrapper: ({ children }) => <I18nProvider locale="en-US" blob={{ core, modules, remote }}>{children}</I18nProvider>,
  });
}

const bedtime: Routine = {
  id: 'r1', name: 'Bedtime', icon: '🌙', view: 'ring', sound: true,
  steps: [{ id: 's1', label: 'Brush teeth', icon: '🪥', durationSec: 120 }],
};

afterEach(cleanup);

describe('the routine form on the phone', () => {
  it('says why a save did not go through, in its own footer, not on the tab hidden under it', async () => {
    const onSave = vi.fn(async () => false);
    const { rerender } = render(<RoutineFormOverlay routine={bedtime} onClose={() => {}} onSave={onSave} saveError={null} />);
    // An error left on the tab from before the form opened is not this form's to show.
    rerender(<RoutineFormOverlay routine={bedtime} onClose={() => {}} onSave={onSave} saveError="Old trouble." />);
    expect(screen.queryByText('Old trouble.')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: core.actions.save })); });
    rerender(<RoutineFormOverlay routine={bedtime} onClose={() => {}} onSave={onSave} saveError="Couldn't save. Check that Home Screens is on." />);
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByText("Couldn't save. Check that Home Screens is on.")).toBeTruthy();
  });
});
