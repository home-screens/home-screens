import { isoDateInTZ } from '@/lib/timezone';

/**
 * The name a downloaded backup is saved under, dated with the household's
 * calendar day. `toISOString()` gave the UTC day, so a backup made at 8 pm in
 * Chicago was named after tomorrow. A file that holds keys gets its own name
 * so it stands out in a downloads folder.
 */
export function backupFileName(
  timezone: string | undefined,
  { withKeys = false }: { withKeys?: boolean } = {},
  now: Date = new Date(),
): string {
  const day = isoDateInTZ(now, timezone);
  return withKeys ? `home-screens-backup-with-keys-${day}.json` : `home-screens-backup-${day}.json`;
}
