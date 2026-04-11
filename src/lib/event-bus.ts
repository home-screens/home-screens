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
  ownerId?: string;
}

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  private lastValues = new Map<string, unknown>();
  private ownerSubs = new Map<string, Set<() => void>>();

  publish<K extends keyof EventMap>(channel: K, data: EventMap[K]): void {
    this.lastValues.set(channel, data);
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (data: EventMap[K]) => void)(data);
      } catch (err) {
        console.debug('[event-bus] handler threw:', err);
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
          console.debug('[event-bus] replay handler threw:', err);
        }
      }
    }

    const unsub = () => { set.delete(handler as Handler); };

    if (options?.ownerId) {
      if (!this.ownerSubs.has(options.ownerId)) {
        this.ownerSubs.set(options.ownerId, new Set());
      }
      this.ownerSubs.get(options.ownerId)!.add(unsub);
    }

    return unsub;
  }

  unsubscribeAll(ownerId: string): void {
    const subs = this.ownerSubs.get(ownerId);
    if (!subs) return;
    for (const unsub of subs) unsub();
    this.ownerSubs.delete(ownerId);
  }

  getLastValue<K extends keyof EventMap>(channel: K): EventMap[K] | null {
    return (this.lastValues.get(channel) as EventMap[K]) ?? null;
  }
}

export const eventBus = new EventBus();
