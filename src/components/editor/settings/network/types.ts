/* Shared types for network settings sub-components */

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

export interface RollbackState {
  pending: boolean;
  rollbackId?: string;
  remainingMs?: number;
}
