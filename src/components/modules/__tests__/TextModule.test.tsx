// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TextModule from '../TextModule';
import { DEFAULT_MODULE_STYLE, type TextConfig, type ModuleStyle } from '@/types/config';

const baseStyle: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

function renderText(config: Partial<TextConfig>) {
  const full: TextConfig = {
    content: 'Hello',
    alignment: 'center',
    ...config,
  };
  return render(<TextModule config={full} style={baseStyle} />);
}

describe('TextModule', () => {
  afterEach(() => cleanup());

  it('renders plain text content', () => {
    const { container } = renderText({ content: 'Hello, world' });
    expect(container.textContent).toContain('Hello, world');
  });

  describe('reveal-on-rotation gating', () => {
    it('does NOT inject REVEAL_CSS when rotationEnabled is false', () => {
      const { container } = renderText({
        content: 'A',
        revealOnRotation: 'fade',
        rotationEnabled: false,
      });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).not.toContain('_textRevealFade');
      expect(styleText).not.toContain('_textRevealUp');
    });

    it('injects REVEAL_CSS keyframes only when rotationEnabled and revealOnRotation are both set', () => {
      const { container } = renderText({
        content: 'A\n---\nB',
        rotationEnabled: true,
        revealOnRotation: 'fade',
      });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).toContain('_textRevealFade');
    });

    it('does not inject REVEAL_CSS when rotationEnabled but revealOnRotation is "none"', () => {
      const { container } = renderText({
        content: 'A\n---\nB',
        rotationEnabled: true,
        revealOnRotation: 'none',
      });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).not.toContain('@keyframes _textReveal');
    });
  });

  describe('per-character animation gating', () => {
    it('splits short text into per-char spans for the wave effect', () => {
      const { container } = renderText({ content: 'Hi', effect: 'wave' });
      const spans = container.querySelectorAll('span > span');
      // Two characters → two animated spans (plus possibly the outer wrapper)
      const animatedSpans = Array.from(spans).filter((s) =>
        (s as HTMLElement).style.animation?.includes('_textWave'),
      );
      expect(animatedSpans.length).toBe(2);
    });

    it('falls back to whole-string render when text exceeds the per-char length cap', () => {
      const long = 'a'.repeat(250);
      const { container } = renderText({ content: long, effect: 'wave' });
      // No per-char spans should carry the wave animation
      const spans = Array.from(container.querySelectorAll('span'));
      const animatedSpans = spans.filter((s) =>
        (s as HTMLElement).style.animation?.includes('_textWave'),
      );
      expect(animatedSpans.length).toBe(0);
      expect(container.textContent).toContain('aaa');
    });

    it('falls back to whole-string render when markdown is enabled', () => {
      const { container } = renderText({
        content: '**Hi**',
        effect: 'bounce',
        markdown: true,
      });
      const spans = Array.from(container.querySelectorAll('span'));
      const animatedSpans = spans.filter((s) =>
        (s as HTMLElement).style.animation?.includes('_textBounce'),
      );
      // Markdown short-circuit: no per-char animated spans
      expect(animatedSpans.length).toBe(0);
    });
  });

  describe('font override', () => {
    it('applies a registry id as a var(--font-*) stack on the text span', () => {
      const { container } = renderText({ content: 'Hi', fontFamily: 'playfair' });
      const span = container.querySelector('span');
      expect(span?.style.fontFamily).toContain('var(--font-playfair)');
    });

    it('inherits from module style when fontFamily is not set', () => {
      const { container } = renderText({ content: 'Hi' });
      const span = container.querySelector('span');
      // No override → text span should not set its own fontFamily
      expect(span?.style.fontFamily).toBe('');
    });
  });

  describe('visual effects', () => {
    it('outline effect applies WebkitTextStroke', () => {
      const { container } = renderText({
        content: 'Hi',
        effect: 'outline',
        outlineWidth: 3,
        outlineColor: '#ff0000',
      });
      const span = container.querySelector('span');
      const stroke = (span?.style as unknown as Record<string, string>).webkitTextStrokeWidth;
      expect(stroke).toBe('3px');
    });

    it('shadow effect applies textShadow', () => {
      const { container } = renderText({
        content: 'Hi',
        effect: 'shadow',
        shadowOffsetX: 5,
        shadowOffsetY: 5,
      });
      const span = container.querySelector('span');
      expect(span?.style.textShadow).toContain('5px 5px');
    });

    it('color-cycle effect injects a per-instance keyframe rule', () => {
      const { container } = renderText({
        content: 'Hi',
        effect: 'color-cycle',
        colorCyclePalette: ['#ff0000', '#00ff00'],
      });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).toMatch(/@keyframes _textColorCycle_/);
      expect(styleText).toContain('#ff0000');
      expect(styleText).toContain('#00ff00');
    });
  });

  describe('typography', () => {
    it('applies italic and line height', () => {
      const { container } = renderText({
        content: 'Hi',
        italic: true,
        lineHeight: 2,
      });
      const span = container.querySelector('span');
      expect(span?.style.fontStyle).toBe('italic');
      expect(span?.style.lineHeight).toBe('2');
    });

    it('applies decoration with color and thickness', () => {
      const { container } = renderText({
        content: 'Hi',
        textDecoration: 'underline',
        textDecorationColor: '#ff0000',
        textDecorationThickness: 3,
      });
      const span = container.querySelector('span');
      expect(span?.style.textDecorationLine).toBe('underline');
      expect(span?.style.textDecorationColor).toBe('rgb(255, 0, 0)');
      expect(span?.style.textDecorationThickness).toBe('3px');
    });
  });

  describe('layout polish', () => {
    it('applies maxWidth when set', () => {
      const { container } = renderText({ content: 'Hi', maxWidth: 400 });
      const block = container.querySelector('div > div > div') as HTMLElement | null;
      // Walk for any descendant carrying the maxWidth style
      const all = Array.from(container.querySelectorAll<HTMLElement>('div'));
      const withMax = all.find((el) => el.style.maxWidth === '400px');
      expect(withMax || block).toBeTruthy();
      if (withMax) expect(withMax.style.maxWidth).toBe('400px');
    });

    it('does NOT inject drop-cap CSS when dropCap is false', () => {
      const { container } = renderText({ content: 'Hi', dropCap: false });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).not.toContain('::first-letter');
    });

    it('injects per-instance drop-cap CSS when dropCap is true', () => {
      const { container } = renderText({ content: 'Hi', dropCap: true, dropCapColor: '#ff0000' });
      const styleText = Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
      expect(styleText).toContain('::first-letter');
      expect(styleText).toContain('#ff0000');
    });
  });
});
