// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Check, Trash2 } from 'lucide-react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import Notice from '../Notice';
import IconButton from '../IconButton';
import Spinner, { LoadingLine } from '../Spinner';
import StatusDot from '../StatusDot';
import StatusPill from '../StatusPill';

afterEach(cleanup);

describe('Notice', () => {
  it('draws every tone at one strength, and says a one-liner in the tone colour', () => {
    render(<Notice tone="warning" role="status">Your key is missing</Notice>);
    const box = screen.getByRole('status');
    expect(box.className).toContain('border-hs-warning/30');
    expect(box.className).toContain('bg-hs-warning/10');
    expect(screen.getByText('Your key is missing').className).toContain('text-hs-warning');
  });

  it('puts the colour on the title and plain body text under it, with the action beside', () => {
    render(
      <Notice tone="danger" title="Restore failed" action={<button type="button">Try again</button>}>
        The file is damaged.
      </Notice>,
    );
    expect(screen.getByText('Restore failed').className).toContain('text-hs-danger');
    expect(screen.getByText('The file is damaged.').className).toContain('text-hs-text-secondary');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('passes data attributes through for tests and lookups', () => {
    render(<Notice tone="success" testId="ok" data-permission="asset.view">Fine</Notice>);
    expect(screen.getByTestId('ok').getAttribute('data-permission')).toBe('asset.view');
  });
});

describe('IconButton', () => {
  it('always has a name, which is also its tooltip', () => {
    const onClick = vi.fn();
    render(<IconButton label="Remove this route" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Remove this route' });
    expect(button.getAttribute('title')).toBe('Remove this route');
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('turns red on hover for removing, and takes another icon', () => {
    render(<IconButton label="Delete chore" icon={Trash2} size="md" />);
    const button = screen.getByRole('button', { name: 'Delete chore' });
    expect(button.className).toContain('hover:text-hs-danger');
    expect(button.className).toContain('h-7');
  });
});

describe('Spinner and LoadingLine', () => {
  it('spins without speaking; the line beside it speaks', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    render(
      <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
        <LoadingLine />
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });
});

describe('StatusDot', () => {
  it('draws status from the theme tokens', () => {
    const { container } = render(<StatusDot tone="success" pulse />);
    const fills = [...container.querySelectorAll('span span')].map((el) => el.className);
    expect(fills.some((c) => c.includes('bg-hs-success') && c.includes('animate-ping'))).toBe(true);
    expect(fills.some((c) => c.includes('bg-hs-success') && !c.includes('animate-ping'))).toBe(true);
  });
});

describe('StatusPill', () => {
  it('draws every tone at the one strength Notice uses', () => {
    render(<StatusPill tone="warning">Update waiting</StatusPill>);
    const pill = screen.getByText('Update waiting');
    expect(pill.className).toContain('border-hs-warning/30');
    expect(pill.className).toContain('bg-hs-warning/10');
    expect(pill.className).toContain('text-hs-warning');
    expect(pill.getAttribute('data-status-pill')).toBe('warning');
  });

  it('puts the tone dot in front, pulsing for something live', () => {
    const { container } = render(<StatusPill tone="success" dot="pulse">Active</StatusPill>);
    const fills = [...container.querySelectorAll('span span span')].map((el) => el.className);
    expect(fills.some((c) => c.includes('bg-hs-success') && c.includes('animate-ping'))).toBe(true);
  });

  it('draws an icon instead of a dot, hidden from screen readers', () => {
    const { container } = render(<StatusPill tone="danger" icon={Check}>Failed</StatusPill>);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('drops only the outline when it is not bordered, and passes attributes through', () => {
    render(<StatusPill tone="neutral" size="sm" bordered={false} data-testid="never" title="Never checked in">Offline</StatusPill>);
    const pill = screen.getByTestId('never');
    expect(pill.className).toContain('border-transparent');
    expect(pill.className).not.toContain('border-hs-border-strong');
    expect(pill.className).toContain('bg-hs-card');
    expect(pill.className).toContain('text-[10px]');
    expect(pill.getAttribute('title')).toBe('Never checked in');
  });
});
