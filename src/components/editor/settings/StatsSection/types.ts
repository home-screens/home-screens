/* Wire-format types for `/api/system/stats` live in `@/lib/system-stats-types`
 * (shared with the server route) and are re-exported here so existing call
 * sites don't have to change. */

export type { DiskInfo, SystemStats } from '@/lib/system-stats-types';
