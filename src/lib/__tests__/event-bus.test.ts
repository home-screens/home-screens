import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../event-bus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers published events to subscribers', () => {
    const handler = vi.fn();
    bus.subscribe('weather.conditions', handler);
    bus.publish('weather.conditions', {
      condition: 'rain',
      temp: 62,
      units: 'imperial',
      icon: '10d',
      summary: 'Light rain',
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ condition: 'rain', temp: 62 }),
    );
  });

  it('caches the last published value', () => {
    bus.publish('weather.conditions', {
      condition: 'clear',
      temp: 75,
      units: 'imperial',
      icon: '01d',
      summary: 'Clear sky',
    });
    const last = bus.getLastValue('weather.conditions');
    expect(last).toEqual(
      expect.objectContaining({ condition: 'clear', temp: 75 }),
    );
  });

  it('returns null for channels with no published value', () => {
    expect(bus.getLastValue('weather.conditions')).toBeNull();
  });

  it('replays last value on subscribe when replay: true', () => {
    bus.publish('time.period', {
      period: 'morning',
      hour: 8,
      timezone: 'America/New_York',
    });
    const handler = vi.fn();
    bus.subscribe('time.period', handler, { replay: true });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'morning' }),
    );
  });

  it('does not replay when replay option is omitted', () => {
    bus.publish('time.period', {
      period: 'morning',
      hour: 8,
      timezone: 'America/New_York',
    });
    const handler = vi.fn();
    bus.subscribe('time.period', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the handler', () => {
    const handler = vi.fn();
    const unsub = bus.subscribe('weather.conditions', handler);
    unsub();
    bus.publish('weather.conditions', {
      condition: 'rain',
      temp: 60,
      units: 'imperial',
      icon: '10d',
      summary: 'Rain',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates errors — one throwing handler does not break others', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.subscribe('weather.conditions', bad);
    bus.subscribe('weather.conditions', good);

    bus.publish('weather.conditions', {
      condition: 'snow',
      temp: 28,
      units: 'imperial',
      icon: '13d',
      summary: 'Snow',
    });

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalled();
  });

  it('supports multiple subscribers on the same channel', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('weather.conditions', h1);
    bus.subscribe('weather.conditions', h2);

    bus.publish('weather.conditions', {
      condition: 'fog',
      temp: 50,
      units: 'metric',
      icon: '50d',
      summary: 'Fog',
    });

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
