/* Wire-format types for the network settings surface live in
 * `@/lib/network-types` (shared with the server routes) and are re-exported
 * here so existing call sites don't have to change. */

export type {
  IPv4Info,
  WifiInfo,
  NetworkInterface,
  NetworkOverview,
  WifiNetwork,
  SavedNetwork,
} from '@/lib/network-types';
