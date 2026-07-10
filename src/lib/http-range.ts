/**
 * Parse a single-range `Range` header against a known resource size.
 *
 * Returns:
 * - `null` when no Range header is present → serve the full file with 200.
 * - `{ start, end }` (inclusive byte offsets) for a satisfiable range → 206.
 * - `'unsatisfiable'` for malformed, multi-range, or out-of-bounds requests
 *   → 416 with an unsatisfied-range Content-Range header.
 */
export function parseRangeHeader(
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'unsatisfiable';
  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return 'unsatisfiable';

  // Suffix range: bytes=-N → the final N bytes
  if (startStr === '') {
    const suffix = Number(endStr);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(startStr);
  if (start >= size) return 'unsatisfiable';
  const end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1);
  if (start > end) return 'unsatisfiable';
  return { start, end };
}
