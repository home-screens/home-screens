/**
 * Wire-format types for `/api/system/network`. Shared between the server route
 * and the settings UI so a field added on one side doesn't go silently
 * unconsumed on the other.
 */

export interface IPv4Info {
  address: string;
  prefix: number;
  gateway: string;
  dns: string[];
  method: 'auto' | 'manual';
}

export interface WifiInfo {
  ssid: string;
  signal: number;
  frequency: number;
  security: string;
}

export interface NetworkInterface {
  device: string;
  type: string;
  state: string;
  connection: string;
  connectionUuid?: string;
  hwAddress: string;
  ipv4?: IPv4Info;
  wifi?: WifiInfo;
  driver?: string;
  isManagementInterface: boolean;
}

export interface NetworkOverview {
  available: boolean;
  reason?: string;
  hostname?: string;
  interfaces?: NetworkInterface[];
}
