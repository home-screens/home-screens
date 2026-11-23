// @vitest-environment jsdom

/**
 * The Stats page's Display card says what the wall last reported it was doing
 * in the household's language, not the raw state word the heartbeat carries.
 */

import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import type { DisplayStatus } from '@/lib/display-commands';
import { DisplayCard } from '../StatsSection/DisplayCard';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, editor }}>{children}</I18nProvider>;
}

function status(displayState: DisplayStatus['displayState']): DisplayStatus {
  return {
    currentScreen: { id: 'home', name: 'Home', index: 0 },
    screenCount: 2,
    activeProfile: null,
    displayState,
    timestamp: Date.now(),
  } as unknown as DisplayStatus;
}

function renderCard(displayStatus: DisplayStatus | null, connected = true) {
  return render(
    <DisplayCard
      displayStatus={displayStatus}
      displayConnected={connected}
      displayState={displayStatus?.displayState}
      statusAge={1000}
      isMultiDisplay={false}
      displays={[]}
      selectedDisplayId={null}
      setSelectedDisplay={() => {}}
      activeDisplay={null}
    />,
    { wrapper: Wrapper },
  );
}

afterEach(cleanup);

describe('Stats Display card state pill', () => {
  it.each([
    ['active', 'Active', 'success'],
    ['dimmed', 'Dimmed', 'warning'],
    ['asleep', 'Asleep', 'neutral'],
  ] as const)('reads %s as "%s" in its tone', (state, words, tone) => {
    renderCard(status(state));
    const pill = screen.getByText(words);
    expect(pill.getAttribute('data-status-pill')).toBe(tone);
    expect(screen.queryByText(state)).toBeNull();
  });

  it('says Offline when nothing has reported lately', () => {
    renderCard(status('active'), false);
    expect(screen.getByText('Offline').getAttribute('data-status-pill')).toBe('neutral');
  });
});
