// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemberBadge } from '../MemberBadge';
import { memberInk } from '@/lib/family-avatar';
import { ink } from '@/lib/constants';

afterEach(cleanup);

const badge = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('MemberBadge', () => {
  it('writes the letters in the ink that reads on the person\'s colour', () => {
    // The colour as the DOM writes it back, for comparing like with like.
    const asStyle = (color: string) => {
      const probe = document.createElement('i');
      probe.style.color = color;
      return probe.style.color;
    };
    const amber = badge(render(<MemberBadge initials="A" color="#fbbf24" />).container);
    expect(amber.textContent).toBe('A');
    expect(amber.style.color).toBe(asStyle(memberInk('#fbbf24')));
    expect(amber.style.color).not.toBe(asStyle('#ffffff'));
    cleanup();
    const blue = badge(render(<MemberBadge initials="B" color="#2563eb" />).container);
    expect(blue.style.color).toBe(asStyle(memberInk('#2563eb')));
  });

  it('is sized in ems unless told otherwise', () => {
    const el = badge(render(<MemberBadge initials="E" color="#2563eb" />).container);
    expect(el.style.width).toBe('1.7em');
    expect(el.style.fontSize).toBe('0.8em');
    cleanup();
    const px = badge(render(<MemberBadge initials="E" color="#2563eb" size={40} fontSize={18} />).container);
    expect(px.style.width).toBe('40px');
    expect(px.style.fontSize).toBe('18px');
  });

  it('shrinks longer letters inside the same circle', () => {
    const el = badge(render(<MemberBadge initials="Sam" color="#2563eb" size="1.7em" />).container);
    expect(el.style.width).toBe('1.7em');
    expect((el.firstElementChild as HTMLElement).style.fontSize).toBe('0.72em');
  });

  it('draws someone who has left the family on a neutral badge', () => {
    const el = badge(render(<MemberBadge initials="?" color={null} />).container);
    expect(el.getAttribute('style')).toContain(ink(0.25));
  });

  it('draws a person\'s own icon in place of the letters', () => {
    const el = badge(render(<MemberBadge initials="M" color="#2563eb"><svg data-testid="icon" /></MemberBadge>).container);
    expect(el.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(el.textContent).toBe('');
  });
});
