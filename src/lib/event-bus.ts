import { logger } from '@/lib/logger';

const log = logger('event-bus');

// ── Event type definitions ──────────────────────────────────────────

export type WeatherCondition =
  | 'clear' | 'clouds' | 'rain' | 'drizzle'
  | 'snow' | 'thunderstorm' | 'fog' | 'wind';

export interface WeatherConditionsEvent {
  condition: WeatherCondition;
  temp: number;
  units: 'imperial' | 'metric';
  icon: string;
  summary: string;
  humidity?: number;
  feelsLike?: number;
}

export interface TimePeriodEvent {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  hour: number;
  timezone: string;
}

export interface WeatherAlertsEvent {
  alerts: Array<{
    headline: string;
    severity: 'minor' | 'moderate' | 'severe' | 'extreme';
    event: string;
    expires?: string;
  }>;
}

export interface EventMap {
  'weather.conditions': WeatherConditionsEvent;
  'weather.alerts': WeatherAlertsEvent;
  'time.period': TimePeriodEvent;
}

// ── EventBus implementation ─────────────────────────────────────────

type Handler = (data: never) => void;

export interface SubscriptionOptions {
  replay?: boolean;
}

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private lastValues = new Map<string, unknown>();

  publish<K extends keyof EventMap>(channel: K, data: EventMap[K]): void {
    this.lastValues.set(channel, data);
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (data: EventMap[K]) => void)(data);
      } catch (err) {
        log.debug('handler threw:', err);
      }
    }
  }

  subscribe<K extends keyof EventMap>(
    channel: K,
    handler: (data: EventMap[K]) => void,
    options?: SubscriptionOptions,
  ): () => void {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    const set = this.handlers.get(channel)!;
    set.add(handler as Handler);

    if (options?.replay) {
      const last = this.lastValues.get(channel);
      if (last !== undefined) {
        try {
          handler(last as EventMap[K]);
        } catch (err) {
          log.debug('replay handler threw:', err);
        }
      }
    }

    return () => { set.delete(handler as Handler); };
  }

  getLastValue<K extends keyof EventMap>(channel: K): EventMap[K] | null {
    return (this.lastValues.get(channel) as EventMap[K]) ?? null;
  }
}

export const eventBus = new EventBus();
