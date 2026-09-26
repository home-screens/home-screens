// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_MODULE_STYLE, type TodoistConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { getModuleDefinition } from '@/lib/module-registry';
import type { TodoistData } from '../todoist/todoist-utils';

/**
 * A poll that brings nothing new hands back the same object, so the due
 * labels cannot wait for a new object to learn the day has changed: a task
 * due today reads Yesterday after midnight with the same tasks on file.
 */

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// One object for every render, as unchanged polls now deliver.
const data: TodoistData = {
  tasks: [{
    id: 't1', content: 'Water the garden', description: '', priority: 1,
    due: { date: '2026-09-25', datetime: null, isRecurring: false },
    labels: [], labelColors: {}, projectId: 'p1', projectName: 'Home', projectColor: 'blue',
    sectionName: '', parentId: null, order: 1, commentCount: 0,
  }],
  projects: [{ id: 'p1', name: 'Home', color: 'blue', order: 1 }],
};
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [data, null, null],
}));

const { default: TodoistModule } = await import('../TodoistModule');

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

const config = { ...getModuleDefinition('todoist')!.defaultConfig, groupBy: 'none' } as unknown as TodoistConfig;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T23:58:30Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TodoistModule across midnight with unchanged tasks', () => {
  it('turns Today into Yesterday once the day changes', async () => {
    const { container } = render(
      <TodoistModule config={config} style={{ ...DEFAULT_MODULE_STYLE }} timeFormat="24h" timezone="UTC" />,
      { wrapper: Wrapper },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(container.textContent).toContain('Today');
    expect(container.textContent).not.toContain('Yesterday');

    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 60_000); });

    expect(container.textContent).toContain('Yesterday');
  });
});
