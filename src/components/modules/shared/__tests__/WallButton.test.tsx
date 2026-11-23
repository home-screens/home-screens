// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WallButton } from '../WallButton';
import { WALL_BUTTON_CLASS, WALL_ROW_CLASS } from '../wallPress';

afterEach(cleanup);

describe('WallButton', () => {
  it('is a plain button with the wall press class and its own classes', () => {
    render(<WallButton className="rounded-full">Yes</WallButton>);
    const button = screen.getByRole('button', { name: 'Yes' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.classList.contains(WALL_BUTTON_CLASS)).toBe(true);
    expect(button.classList.contains('rounded-full')).toBe(true);
  });

  it('looks pressed the moment a finger lands, and lets go with it', () => {
    render(<WallButton>Yes</WallButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    expect(button.hasAttribute('data-pressed')).toBe(true);
    fireEvent.pointerUp(button);
    expect(button.hasAttribute('data-pressed')).toBe(false);
    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    expect(button.hasAttribute('data-pressed')).toBe(false);
  });

  it('keeps its own pointer handlers and click, after the press', () => {
    const down = vi.fn();
    const click = vi.fn();
    render(<WallButton onPointerDown={down} onClick={click}>Yes</WallButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button);
    expect(down).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('data-pressed')).toBe(true);
    fireEvent.click(button);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('tints as a row instead of shrinking', () => {
    render(<WallButton row>Soup</WallButton>);
    const button = screen.getByRole('button');
    expect(button.classList.contains(WALL_ROW_CLASS)).toBe(true);
    expect(button.classList.contains(WALL_BUTTON_CLASS)).toBe(false);
  });
});
