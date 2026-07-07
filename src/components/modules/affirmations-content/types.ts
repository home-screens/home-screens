import type { AffirmationsCategory } from '@/types/config';
import type { WeatherCondition } from '@/lib/event-bus';

/**
 * Shape of a built-in affirmations seed entry.
 *
 * Every locale's list must stay index-aligned with en-US: same length, and
 * identical `category` / `time` / `days` / `season` / `weather` /
 * `attribution` at each index — only `text` is translated. The context
 * scorer in AffirmationsModule keys off this metadata, so parity keeps
 * rotation behavior identical across languages (locked by
 * affirmations-logic.test.ts).
 */
export interface AffirmationEntry {
  text: string;
  attribution?: string;
  category: AffirmationsCategory;
  /** Time-of-day affinity: morning / afternoon / evening / night / anytime */
  time?: 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime';
  /** Day-of-week affinity: 0=Sun..6=Sat */
  days?: number[];
  /** Season affinity */
  season?: 'spring' | 'summer' | 'fall' | 'winter';
  /** Weather condition affinity — boosts score when conditions match */
  weather?: WeatherCondition;
}
