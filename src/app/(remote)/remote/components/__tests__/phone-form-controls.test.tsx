// @vitest-environment jsdom

/**
 * The phone's shared buttons: one save button in three looks, one switch,
 * one person chip. Each replaced several hand-drawn copies that disagreed
 * on colour, ink and what a screen reader heard.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => (key === 'status.saving' ? 'Saving…' : key) }));
vi.mock('@/hooks/useCustomIcons', () => ({ useCustomIcons: () => ({ icons: [], byId: new Map(), loaded: true }) }));

import PrimaryButton from '../PrimaryButton';
import PhoneSwitch from '../PhoneSwitch';
import PersonChip from '../PersonChip';
import SaveDeleteFooter from '../SaveDeleteFooter';
import ConfirmSheet from '../ConfirmSheet';
import { DANGER_BUTTON, REMOTE_ACCENT, REMOTE_ACCENT_INK, REMOTE_ON_ACCENT, chipCountStyle, primaryButtonStyle, segmentStyle, selectedPillStyle, toggleChipStyle } from '../remote-styles';

afterEach(cleanup);

describe('PrimaryButton', () => {
  it('is amber with dark ink when it can be pressed', () => {
    render(<PrimaryButton onClick={() => {}}>Save</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.style.background).toBe(REMOTE_ACCENT === '#f59e0b' ? 'rgb(245, 158, 11)' : REMOTE_ACCENT);
    expect(button.style.color).toBe(REMOTE_ON_ACCENT);
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('greys out when it cannot be pressed yet, without a caller picking an opacity', () => {
    const onClick = vi.fn();
    render(<PrimaryButton disabled onClick={onClick}>Save</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.style.opacity).toBe(String(primaryButtonStyle('disabled').opacity));
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('says Saving while it works, cannot be pressed twice and tells a screen reader', () => {
    const onClick = vi.fn();
    render(<PrimaryButton busy onClick={onClick}>Save</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('takes the words of what it is doing instead', () => {
    render(<PrimaryButton busy busyLabel="Sending…">Send</PrimaryButton>);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeTruthy();
  });

  it('can be as wide as its words for the one button under an empty page', () => {
    render(<PrimaryButton compact onClick={() => {}}>Add Meals</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'Add Meals' });
    expect(button.style.width).toBe('auto');
    expect(button.style.minHeight).toBe('44px');
    expect(button.style.color).toBe(REMOTE_ON_ACCENT);
  });

  it('is a submit only when asked', () => {
    render(<><PrimaryButton>One</PrimaryButton><PrimaryButton type="submit">Two</PrimaryButton></>);
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'Two' }).getAttribute('type')).toBe('submit');
  });
});

describe('SaveDeleteFooter', () => {
  it('says Saving only for a save, and rests both buttons while a delete is on its way', () => {
    const { rerender } = render(<SaveDeleteFooter saveLabel="Save" canSave onSave={() => {}} deleteLabel="Remove" onDelete={() => {}} deleting />);
    const save = screen.getByRole('button', { name: 'Save' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(save.getAttribute('aria-busy')).toBeNull();
    expect(remove.hasAttribute('disabled')).toBe(true);
    expect(remove.getAttribute('aria-busy')).toBe('true');

    rerender(<SaveDeleteFooter saveLabel="Save" canSave onSave={() => {}} deleteLabel="Remove" onDelete={() => {}} busy />);
    expect(screen.getByRole('button', { name: 'Saving…' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Remove' }).hasAttribute('disabled')).toBe(true);
  });

  it('says the shared Save unless the form creates something', () => {
    const { rerender } = render(<SaveDeleteFooter canSave onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeTruthy();

    rerender(<SaveDeleteFooter saveLabel="Add chore" canSave onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add chore' })).toBeTruthy();
  });
});

describe('ConfirmSheet answer', () => {
  const ask = (props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) => render(
    <ConfirmSheet title="Sure?" description="Really." confirmLabel="Go" onConfirm={() => {}} onCancel={() => {}} {...props} />,
  );

  it('is red with its own readable ink when it removes something, the default', () => {
    ask();
    const go = screen.getByRole('button', { name: 'Go' });
    expect(go.style.background).toBe('var(--hs-danger)');
    expect(go.style.color).toBe('var(--hs-on-danger)');
  });

  it('is the phone amber with dark words when it loses nothing', () => {
    ask({ tone: 'primary' });
    const go = screen.getByRole('button', { name: 'Go' });
    expect(go.style.background).toBe('rgb(245, 158, 11)');
    expect(go.style.color).toBe(REMOTE_ON_ACCENT);
  });

  it('takes a person\'s own colour with ink that reads on it', () => {
    ask({ tone: 'primary', memberColor: '#fde68a' });
    const go = screen.getByRole('button', { name: 'Go' });
    expect(go.style.background).toBe('rgb(253, 230, 138)');
    expect(go.style.color).not.toBe('rgb(255, 255, 255)');
  });

  it('gives the chart\'s amber fallback its theme ink, not white', () => {
    ask({ tone: 'primary', memberColor: REMOTE_ACCENT_INK });
    expect(screen.getByRole('button', { name: 'Go' }).style.color).toBe('var(--hs-on-warning-ink)');
  });
});

describe('the shared tokens', () => {
  it('lights a chip\'s count with its chip', () => {
    expect(chipCountStyle(true).color).toBe(REMOTE_ACCENT_INK);
    expect(chipCountStyle(false).color).toBe('var(--hs-text-muted)');
  });

  it('lights a chosen segment in amber, at a full 44 px', () => {
    const on = segmentStyle(true);
    expect(on.minHeight).toBe(44);
    expect(on.color).toBe(REMOTE_ACCENT_INK);
    expect(segmentStyle(false).color).toBe('var(--hs-text-muted)');
  });

  it('writes a chosen chip\'s words and edge in the theme\'s amber, so they read on the light theme too', () => {
    expect(REMOTE_ACCENT_INK).toBe('var(--hs-warning-ink)');
    const on = selectedPillStyle(true);
    expect(on.color).toBe(REMOTE_ACCENT_INK);
    expect(String(on.border)).toContain(REMOTE_ACCENT_INK);
    expect(String(on.background)).not.toContain('var(--hs-warning)');
  });

  it('draws an on/off chip at a full 44 px, amber only when on', () => {
    expect(toggleChipStyle(true).minHeight).toBe(44);
    expect(toggleChipStyle(true).color).toBe(REMOTE_ACCENT_INK);
    expect(toggleChipStyle(false).color).toBe('var(--hs-text-muted)');
  });

  it('draws a delete as the quiet red tint', () => {
    expect(DANGER_BUTTON.color).toBe('var(--hs-danger)');
    expect(String(DANGER_BUTTON.background)).toContain('var(--hs-danger)');
  });
});

describe('PhoneSwitch', () => {
  it('is a switch named by its words, with its state, and toggles from the whole row', () => {
    const onChange = vi.fn();
    render(<PhoneSwitch checked={false} onChange={onChange} label="All day" description="No start or end time" />);
    const toggle = screen.getByRole('switch', { name: 'All day' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('can be named for its field when its words follow its state', () => {
    render(<PhoneSwitch checked onChange={() => {}} label="Visible" ariaLabel="Enabled" />);
    expect(screen.getByRole('switch', { name: 'Enabled' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('PersonChip', () => {
  const noah = { name: 'Noah Smith', color: '#4ade80', emoji: undefined };

  it('shows initials when the person has no icon, and their own icon when they do', () => {
    const { rerender } = render(<PersonChip member={noah} selected={false} />);
    expect(screen.getByRole('button').textContent).toBe('NNoah Smith');
    rerender(<PersonChip member={{ ...noah, emoji: '⚽' }} selected={false} />);
    expect(screen.getByRole('button').textContent).toContain('⚽');
  });

  it('is lit in the person\'s own colour when chosen', () => {
    render(<PersonChip member={noah} selected aria-pressed />);
    const chip = screen.getByRole('button', { pressed: true });
    expect(chip.style.border).toContain('rgb(74, 222, 128)');
    expect(chip.style.height).toBe('44px');
  });

  it('passes the caller\'s data and tap through', () => {
    const onClick = vi.fn();
    render(<PersonChip member={noah} selected={false} data-author-id="noah" onClick={onClick} trailing={<span>· 4</span>} />);
    const chip = screen.getByRole('button');
    expect(chip.getAttribute('data-author-id')).toBe('noah');
    expect(chip.textContent).toContain('· 4');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
