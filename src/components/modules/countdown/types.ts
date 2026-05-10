import type { CountdownConfig, CountdownEvent } from '@/types/config';

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
  totalMs: number;
}

export interface ProcessedEvent extends CountdownEvent {
  time: TimeRemaining;
  stayingForToday: boolean;
}

export interface CountdownViewProps {
  events: ProcessedEvent[];
  config: CountdownConfig;
  scale: number;
  basePx: number;
}
