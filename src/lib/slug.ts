/**
 * A name as a lower-case, dash-separated slug: "Kitchen Wall!" reads
 * "kitchen-wall". Used for a display's id suggested from its name and for
 * the file name of an exported layout. Empty when the name holds no letter
 * or digit, which each caller handles itself.
 */
export function dashSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
