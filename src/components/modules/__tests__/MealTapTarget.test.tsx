// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SavedMeal } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { MealTapTarget, resolveRecipeTapMode, type RecipeTapMode } from '../shared/MealTapTarget';
import { useInteractionHeld } from '@/lib/interaction-hold';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

const meal: SavedMeal = {
  id: 'm1',
  name: 'Tacos',
  emoji: '🌮',
  recipeUrl: 'https://example.com/tacos',
};

function targetElement(mode: RecipeTapMode, target: SavedMeal | null = meal) {
  return (
    <MealTapTarget meal={target} mode={mode} className="cluster">
      <span>Tacos</span>
    </MealTapTarget>
  );
}

function renderTarget(mode: RecipeTapMode, target: SavedMeal | null = meal) {
  return render(targetElement(mode, target), { wrapper: Wrapper });
}

// The overlay is lazy-loaded, so opening it needs an async act to let the
// dynamic import resolve before asserting on the dialog.
async function openOverlay(container: HTMLElement) {
  await act(async () => {
    fireEvent.click(container.querySelector('button')!);
  });
}

// Resolve the lazy RecipeOverlay chunk once (with real timers) so every test
// renders it synchronously — fake-timer tests can't wait out the first load.
beforeAll(async () => {
  const { container } = renderTarget('qr');
  fireEvent.click(container.querySelector('button')!);
  await screen.findByRole('dialog');
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('resolveRecipeTapMode', () => {
  it('defaults to off when the action is unset', () => {
    expect(resolveRecipeTapMode(undefined, 's1', 'mod1')).toBe('off');
  });

  it('stays off regardless of render context', () => {
    expect(resolveRecipeTapMode('off', 's1', 'mod1')).toBe('off');
    expect(resolveRecipeTapMode('off', undefined, undefined)).toBe('off');
  });

  it('passes the action through on a real display (both ids present)', () => {
    expect(resolveRecipeTapMode('qr', 's1', 'mod1')).toBe('qr');
    expect(resolveRecipeTapMode('iframe', 's1', 'mod1')).toBe('iframe');
  });

  it('falls back to link in the editor preview (missing ids)', () => {
    expect(resolveRecipeTapMode('qr', undefined, undefined)).toBe('link');
    expect(resolveRecipeTapMode('iframe', 's1', undefined)).toBe('link');
    expect(resolveRecipeTapMode('qr', undefined, 'mod1')).toBe('link');
  });
});

describe('MealTapTarget', () => {
  it('renders a plain div when mode is off', () => {
    const { container } = renderTarget('off');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('div.cluster')).not.toBeNull();
  });

  it('renders a plain div when the meal has no recipeUrl', () => {
    const { container } = renderTarget('qr', { id: 'm2', name: 'Soup' });
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders a plain div when there is no meal', () => {
    const { container } = renderTarget('qr', null);
    expect(container.querySelector('button')).toBeNull();
  });

  it('link mode renders a new-tab anchor (editor preview)', () => {
    const { container } = renderTarget('link');
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('https://example.com/tacos');
    expect(anchor!.getAttribute('target')).toBe('_blank');
    expect(anchor!.getAttribute('rel')).toBe('noopener noreferrer');
  });

  describe('qr mode', () => {
    it('opens the QR overlay on click and dismisses on overlay tap', async () => {
      const { container } = renderTarget('qr');
      const button = container.querySelector('button');
      expect(button).not.toBeNull();
      expect(button!.getAttribute('aria-label')).toBe('Open recipe for Tacos');

      await openOverlay(container);
      // Overlay portals to document.body; it shows the meal name and a QR svg.
      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelector('svg')).not.toBeNull();
      expect(dialog.textContent).toContain('Tacos');
      expect(dialog.textContent).toContain('Scan to open recipe');

      fireEvent.click(dialog);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('auto-dismisses after 30 seconds', async () => {
      vi.useFakeTimers();
      const { container } = renderTarget('qr');
      await openOverlay(container);
      expect(screen.getByRole('dialog')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('iframe mode', () => {
    it('opens the embedded recipe with close button, and closes', async () => {
      const { container } = renderTarget('iframe');
      await openOverlay(container);

      const dialog = screen.getByRole('dialog');
      const iframe = dialog.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe!.getAttribute('src')).toBe('https://example.com/tacos');
      expect(iframe!.getAttribute('sandbox')).toBe(
        'allow-scripts allow-same-origin allow-forms allow-popups-to-escape-sandbox',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('switches to the QR panel via the fallback button', async () => {
      const { container } = renderTarget('iframe');
      await openOverlay(container);
      expect(screen.getByRole('dialog').querySelector('iframe')).not.toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelector('iframe')).toBeNull();
      expect(dialog.querySelector('svg')).not.toBeNull();
      expect(dialog.textContent).toContain('Scan to open recipe');
    });

    it('auto-closes after 10 minutes', async () => {
      vi.useFakeTimers();
      const { container } = renderTarget('iframe');
      await openOverlay(container);
      expect(screen.getByRole('dialog')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(10 * 60_000);
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('holds screen rotation while open and releases on close', async () => {
      function HoldProbe() {
        const held = useInteractionHeld();
        return <span data-testid="hold-probe">{held ? 'held' : 'free'}</span>;
      }
      const { container } = render(
        <>
          {targetElement('iframe')}
          <HoldProbe />
        </>,
        { wrapper: Wrapper },
      );
      expect(screen.getByTestId('hold-probe').textContent).toBe('free');

      await openOverlay(container);
      expect(screen.getByTestId('hold-probe').textContent).toBe('held');

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.getByTestId('hold-probe').textContent).toBe('free');
    });

    it('auto-closes on time even when the parent re-renders (clock ticks)', async () => {
      // Regression: the parent passes an inline onClose whose identity changes
      // every render, and the module clock re-renders everything each minute.
      // The countdown must survive those re-renders, not restart.
      vi.useFakeTimers();
      const { container, rerender } = renderTarget('iframe');
      await openOverlay(container);
      expect(screen.getByRole('dialog')).not.toBeNull();

      // Simulate 10 minutes of 60s clock ticks, re-rendering before each one.
      for (let minute = 0; minute < 10; minute++) {
        rerender(targetElement('iframe'));
        act(() => {
          vi.advanceTimersByTime(60_000);
        });
      }
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
