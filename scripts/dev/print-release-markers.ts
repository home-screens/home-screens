/**
 * Print the release-body markers for the code in this tree, one per line:
 *
 *   <!-- home-screens-schema: 13 -->
 *   <!-- home-screens-requires: 1.43.0 -->   (only when REQUIRED_FLOORS is set)
 *
 * `scripts/release.sh` prepends the output to the release notes it commits,
 * so a device's update check can read what this release needs and what it
 * can read (see src/lib/update-policy.ts). Run with `npx tsx`.
 */
import { REQUIRED_FLOORS, getLatestSchemaVersion } from '@/lib/migrations';

const lines = [`<!-- home-screens-schema: ${getLatestSchemaVersion()} -->`];
if (REQUIRED_FLOORS.length > 0) {
  lines.push(`<!-- home-screens-requires: ${REQUIRED_FLOORS.join(', ')} -->`);
}
process.stdout.write(lines.join('\n') + '\n');
