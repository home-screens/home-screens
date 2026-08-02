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

/* ─── /api/system/network/diagnostics ───────── */

export interface GatewayResult {
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
}

export interface InternetResult {
  ip: string;
  reachable: boolean;
  latencyMs: number | null;
}

export interface WatchdogResult {
  active: boolean;
  lastRun: string | null;
}

export interface DiagnosticsResult {
  available: boolean;
  gateway?: GatewayResult;
  internet?: InternetResult;
  watchdog?: WatchdogResult;
}

/* ─── /api/system/network/wifi/* ────────────── */

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  signal: number;    // 0-100
  frequency: number; // MHz
  security: string;  // "WPA2", "WPA3", "WEP", "Open"
  inUse: boolean;    // currently connected
  saved: boolean;    // has a saved connection profile
}

export interface SavedNetwork {
  id: string;
  name: string;
  ssid: string;
  autoconnect: boolean;
  lastUsed: string;
  password?: string;
}
