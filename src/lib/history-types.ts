/**
 * Wire-format types for `/api/history`. Shared between the server route and
 * the History module so a field added on one side doesn't go silently
 * unconsumed on the other.
 */

export interface HistoryEvent {
  year: string;
  text: string;
  source: 'muffinlabs' | 'wikipedia';
}

export interface HistoryResponse {
  events: HistoryEvent[];
}
