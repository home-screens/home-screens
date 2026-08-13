// @vitest-environment jsdom

/**
 * Render contract for the sleep-settings 24-hour preview bar: segment widths
 * must reflect the schedule windows, and the idle legend note appears exactly
 * when idle dimming is on (it has no clock position, so the legend is its only
 * representation).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import SleepTimelinePreview from '../SleepTimelinePreview';

function renderPreview(props: React.ComponentProps<typeof SleepTimelinePreview>) {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <SleepTimelinePreview {...props} />
    </I18nProvider>,
  );
}

function segmentWidths(): string[] {
  const bar = screen.getByTestId('sleep-timeline-preview').firstElementChild!;
  return Array.from(bar.children).map((el) => (el as HTMLElement).style.width);
}

afterEach(cleanup);

describe('SleepTimelinePreview', () => {
  it('renders one full-width bright segment with no windows', () => {
    renderPreview({ idleDimEnabled: false, dimAfterMinutes: 10 });
    expect(segmentWidths()).toEqual(['100%']);
  });

  it('maps an overnight sleep window to proportional off segments', () => {
    renderPreview({
      idleDimEnabled: false,
      dimAfterMinutes: 10,
      sleepWindow: { startTime: '23:00', endTime: '06:00' },
    });
    // 00:00–06:00 off (360/1440 = 25%), 06:00–23:00 bright, 23:00–24:00 off.
    expect(segmentWidths()).toEqual(['25%', '70.83333333333334%', '4.166666666666666%']);
  });

  it('shows the idle note only while idle dimming is on', () => {
    const { unmount } = renderPreview({ idleDimEnabled: true, dimAfterMinutes: 15 });
    expect(screen.getByText('+ dims after 15 quiet minutes, any time')).toBeTruthy();
    unmount();

    renderPreview({ idleDimEnabled: false, dimAfterMinutes: 15 });
    expect(screen.queryByText(/quiet minutes/)).toBeNull();
  });
});
