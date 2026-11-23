// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { FullscreenStateShell, fullscreenStateStyle } from '../FullscreenStateShell';

afterEach(cleanup);

const theme = getThemeTokens('linen');

describe('fullscreenStateStyle', () => {
  it('sizes the states from the canvas, in the theme ink, on a see-through card', () => {
    const portrait = fullscreenStateStyle({ ...DEFAULT_MODULE_STYLE }, theme, { w: 1080, h: 1920 });
    expect(portrait.fontSize).toBe(28);
    expect(portrait.textColor).toBe(theme.text);
    expect(portrait.backgroundColor).toBe('transparent');
    // The short side decides, so a landscape wall draws the same size.
    expect(fullscreenStateStyle({ ...DEFAULT_MODULE_STYLE }, theme, { w: 1920, h: 1080 }).fontSize).toBe(28);
    expect(fullscreenStateStyle({ ...DEFAULT_MODULE_STYLE }, theme, { w: 2160, h: 3840 }).fontSize).toBe(56);
  });
});

describe('FullscreenStateShell', () => {
  it('fills the canvas with the theme ground', () => {
    render(<FullscreenStateShell theme={theme} data-testid="shell"><p>Loading…</p></FullscreenStateShell>);
    const shell = screen.getByTestId('shell');
    expect(shell.className).toBe('w-full h-full');
    expect(shell.style.backgroundColor).not.toBe('');
    expect(shell.textContent).toBe('Loading…');
  });
});
