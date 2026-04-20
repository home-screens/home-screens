/* UI-only types for network settings sub-components. Wire-format types
 * (IPv4Info, WifiInfo, NetworkInterface, NetworkOverview) live in
 * `@/lib/network-types` and are re-exported here so existing call sites
 * don't have to change. */

export type {
  IPv4Info,
  WifiInfo,
  NetworkInterface,
  NetworkOverview,
} from '@/lib/network-types';

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  signal: number;
  frequency: number;
  security: string;
  inUse: boolean;
  saved: boolean;
}

export interface SavedNetwork {
  id: string;
  name: string;
  ssid: string;
  autoconnect: boolean;
  lastUsed: string;
  password?: string;
}
