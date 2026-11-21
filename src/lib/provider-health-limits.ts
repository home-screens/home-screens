/**
 * How much provider health one wall may hold and report. The wall's store
 * keeps to these, and the hub turns away a report that goes past them, so
 * the two read one set of numbers: a raised cap on the wall would otherwise
 * be cut short by the hub without a word.
 */
export const PROVIDER_HEALTH_LIMITS = {
  /** Bounds a hostile or looping reporter; far more than any real install has. */
  maxEntries: 64,
  maxMessageLength: 200,
} as const;
