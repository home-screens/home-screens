// @vitest-environment jsdom

/**
 * A page rendered on the server at one instant and hydrated a few seconds
 * later, across the hour or midnight, must end up showing the later reading.
 *
 * Clock text carries `suppressHydrationWarning`, so React keeps whatever the
 * server wrote and only patches a later render whose value differs from the
 * one it hydrated with. When a clock hydrated from the browser's own instant,
 * the mount tick produced the same value, nothing was patched, and the wall
 * kept the server's hour (or yesterday's date) until that part next changed.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_MODULE_STYLE, type ClockConfig, type CountdownConfig, type DateConfig, type TextConfig, type YearProgressConfig } from '@/types/config';
import { RenderInstantProvider } from '@/hooks/useRenderInstant';
import ClockModule from '@/components/modules/clock/ClockModule';
import DateModule from '@/components/modules/date/DateModule';
import YearProgressModule from '@/components/modules/YearProgressModule';
import TextModule from '@/components/modules/TextModule';
import CountdownModule from '@/components/modules/countdown/CountdownModule';

const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14, so its midnight is nobody else's

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

/**
 * Render `node` to HTML at `serverAt`, then hydrate it at `clientAt` and let
 * the mount effects run. Returns the container's text after hydration.
 */
async function serverThenHydrate(node: React.ReactElement, serverAt: Date, clientAt: Date): Promise<{ server: string; client: HTMLElement }> {
  const tree = (
    <RenderInstantProvider instant={serverAt.getTime()}>
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{node}</I18nProvider>
    </RenderInstantProvider>
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(serverAt);
  const html = renderToString(tree);
  container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const server = container.textContent ?? '';

  vi.setSystemTime(clientAt);
  const recovered: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container!, tree, { onRecoverableError: (error) => recovered.push(error) });
  });
  // Hydrating from the server's instant matches the HTML exactly, so React
  // never has to throw the server's tree away and render it again.
  expect(recovered).toEqual([]);
  return { server, client: container };
}

function clockConfig(over: Partial<ClockConfig> = {}): ClockConfig {
  return {
    ...(getModuleDefinition('clock')!.defaultConfig as unknown as ClockConfig),
    hourFormat: '12h',
    showSeconds: false,
    ...over,
  };
}

const style = { ...DEFAULT_MODULE_STYLE };

describe('clock text after a hydration that straddles the hour', () => {
  it('Classic shows the hydrated hour, not the server hour', async () => {
    // 08:59:57 and 09:00:02 in Kiritimati.
    const { server, client } = await serverThenHydrate(
      <ClockModule config={clockConfig()} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T18:59:57Z'),
      new Date('2026-09-24T19:00:02Z'),
    );
    expect(server).toContain('8:59');
    expect(client.textContent).toContain('9:00');
    expect(client.textContent).not.toContain('8:59');
  });

  it('Classic shows the new day after a hydration across midnight', async () => {
    const { server, client } = await serverThenHydrate(
      <ClockModule config={clockConfig({ dateFormat: 'EEEE, MMMM d' })} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T09:59:58Z'), // Thursday 23:59:58
      new Date('2026-09-24T10:00:03Z'), // Friday 00:00:03
    );
    expect(server).toContain('Thursday, September 24');
    expect(client.textContent).toContain('Friday, September 25');
    expect(client.textContent).toContain('12:00');
  });

  it('Word view moves to the new hour', async () => {
    const { client } = await serverThenHydrate(
      <ClockModule config={clockConfig({ view: 'word', showDate: false })} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T18:59:57Z'),
      new Date('2026-09-24T19:00:02Z'),
    );
    expect(client.textContent?.toLowerCase()).toContain('nine');
    expect(client.textContent?.toLowerCase()).not.toContain('eight');
  });

  it('the Date module shows the new day', async () => {
    const config = { ...(getModuleDefinition('date')!.defaultConfig as unknown as DateConfig) };
    const { server, client } = await serverThenHydrate(
      <DateModule config={config} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T09:59:58Z'),
      new Date('2026-09-24T10:00:03Z'),
    );
    expect(server).toContain('Thursday');
    expect(client.textContent).toContain('Friday');
    expect(client.textContent).not.toContain('Thursday');
  });

  it('Year Progress restarts the day bar at midnight', async () => {
    const config: YearProgressConfig = { showYear: false, showMonth: false, showWeek: false, showDay: true, showPercentage: true };
    const { server, client } = await serverThenHydrate(
      <YearProgressModule config={config} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T09:59:58Z'),
      new Date('2026-09-24T10:00:03Z'),
    );
    expect(server).toContain('99.9%');
    expect(client.textContent).toContain('0.0%');
    expect(client.textContent).not.toContain('99.9%');
  });

  it('a Text template variable shows the new day', async () => {
    const config = {
      ...(getModuleDefinition('text')!.defaultConfig as unknown as TextConfig),
      content: 'Happy {{day}}',
      templateVariables: true,
    };
    const { server, client } = await serverThenHydrate(
      <TextModule config={config} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T09:59:58Z'),
      new Date('2026-09-24T10:00:03Z'),
    );
    expect(server).toContain('Happy Thursday');
    expect(client.textContent).toContain('Happy Friday');
  });

  it('a countdown drops to the new day count', async () => {
    const config: CountdownConfig = {
      ...(getModuleDefinition('countdown')!.defaultConfig as unknown as CountdownConfig),
      format: 'units',
      precision: 'days',
      // Midnight in Kiritimati two days after the render.
      events: [{ id: 'e', name: 'Trip', date: '2026-09-26T00:00:00+14:00' }],
    };
    const { server, client } = await serverThenHydrate(
      <CountdownModule config={config} style={style} timezone={KIRITIMATI} />,
      new Date('2026-09-24T09:59:58Z'), // 1 day and 2 seconds to go
      new Date('2026-09-24T10:00:03Z'), // 23 hours and a bit
    );
    expect(server).toBe('Trip1d');
    expect(client.textContent).toBe('Trip0d');
  });
});
