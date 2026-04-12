/**
 * Shared parsing utilities for nmcli terse output.
 *
 * nmcli terse mode (`-t`) uses `:` as a field separator, with `\:` used
 * to escape literal colons inside field values (e.g. MAC addresses).
 * These helpers centralise that parsing logic so multiple API routes
 * don't duplicate it.
 */

/**
 * Parse a single line of nmcli terse output, handling escaped colons (`\:`).
 * Returns an array of fields for the line.
 *
 * @example
 * parseTerseFields('MyNet:AA\\:BB\\:CC:72:WPA2:2437 MHz:*')
 * // => ['MyNet', 'AA:BB:CC', '72', 'WPA2', '2437 MHz', '*']
 */
export function parseTerseFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length && line[i + 1] === ':') {
      // Escaped colon — include the literal colon
      current += ':';
      i++; // skip the next character
    } else if (line[i] === ':') {
      fields.push(current);
      current = '';
    } else {
      current += line[i];
    }
  }

  // Push the last field
  fields.push(current);
  return fields;
}
