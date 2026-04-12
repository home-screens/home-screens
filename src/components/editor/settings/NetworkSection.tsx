'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';

/* ─── Types ─────────────────────────────────── */

interface IPv4Info {
  address: string;
  prefix: number;
  gateway: string;
  dns: string[];
  method: 'auto' | 'manual';
}

interface WifiInfo {
  ssid: string;
  signal: number;
  frequency: number;
  security: string;
}

interface NetworkInterface {
  device: string;
  type: string;
  state: string;
  connection: string;
  hwAddress: string;
  ipv4?: IPv4Info;
  wifi?: WifiInfo;
  driver?: string;
  isManagementInterface: boolean;
}

interface NetworkOverview {
  available: boolean;
  reason?: string;
  hostname?: string;
  interfaces?: NetworkInterface[];
}

interface WifiNetwork {
  ssid: string;
  bssid: string;
  signal: number;
  frequency: number;
  security: string;
  inUse: boolean;
  saved: boolean;
}

/* ─── Constants ─────────────────────────────── */

const POLL_INTERVAL_MS = 10_000;
const SCAN_COOLDOWN_S = 15;

/* ─── Signal bar component ──────────────────── */

function SignalBars({ signal }: { signal: number }) {
  // 5 bars, each representing 20% of signal
  const filledBars = Math.round(signal / 20);
  return (
    <div className="flex items-end gap-[2px] h-3.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm ${
            i < filledBars ? 'bg-hs-accent' : 'bg-hs-border-strong'
          }`}
          style={{ height: `${40 + i * 15}%` }}
        />
      ))}
    </div>
  );
}

/* ─── Interface type label ──────────────────── */

function getInterfaceTypeLabel(iface: NetworkInterface): string {
  if (iface.type === 'ethernet') return 'Ethernet';
  if (iface.type === 'wifi') {
    if (iface.driver === 'brcmfmac') return 'Built-in WiFi';
    if (iface.driver) return `USB WiFi (${iface.driver})`;
    return 'WiFi';
  }
  return iface.type;
}

/* ─── Interface state label ─────────────────── */

function getStateLabel(iface: NetworkInterface): string {
  if (iface.state === 'connected') {
    const parts: string[] = ['Connected'];
    if (iface.wifi?.ssid) {
      parts[0] = `Connected to "${iface.wifi.ssid}"`;
    }
    if (iface.ipv4?.address) {
      parts.push(`(${iface.ipv4.address})`);
    }
    return parts.join(' ');
  }
  if (iface.state === 'disconnected') return 'Disconnected';
  if (iface.state === 'unavailable') return 'Unavailable';
  if (iface.state === 'unmanaged') return 'Unmanaged';
  // Capitalize first letter for other states
  return iface.state.charAt(0).toUpperCase() + iface.state.slice(1);
}

/* ─── Main component ────────────────────────── */

export default function NetworkSection() {
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanResults, setScanResults] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [selectedWifiIface, setSelectedWifiIface] = useState<string>('');
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Fetch overview ────────────────────────── */

  const fetchOverview = useCallback(async () => {
    try {
      const res = await editorFetch('/api/system/network');
      if (res.ok) {
        const data: NetworkOverview = await res.json();
        setOverview(data);

        // Auto-select first wifi interface if none selected
        if (!selectedWifiIface && data.interfaces) {
          const firstWifi = data.interfaces.find((i) => i.type === 'wifi');
          if (firstWifi) setSelectedWifiIface(firstWifi.device);
        }
      }
    } catch (err) {
      console.debug('Failed to fetch network overview:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedWifiIface]);

  /* ── Poll overview every 10s ───────────────── */

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  /* ── WiFi scan ─────────────────────────────── */

  const handleScan = useCallback(async () => {
    if (!selectedWifiIface || cooldownRemaining > 0) return;

    setScanning(true);
    setScanError(null);

    try {
      const res = await editorFetch(
        `/api/system/network/wifi/scan?iface=${encodeURIComponent(selectedWifiIface)}`,
      );
      if (res.ok) {
        const data: WifiNetwork[] = await res.json();
        // Sort by signal descending
        data.sort((a, b) => b.signal - a.signal);
        setScanResults(data);
      } else {
        const errData = await res.json().catch(() => null);
        setScanError(errData?.error ?? 'Scan failed');
      }
    } catch {
      setScanError('Failed to reach server');
    } finally {
      setScanning(false);

      // Start cooldown
      setCooldownRemaining(SCAN_COOLDOWN_S);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [selectedWifiIface, cooldownRemaining]);

  /* ── Cleanup cooldown timer on unmount ─────── */

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  /* ── Loading state ─────────────────────────── */

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        Loading network information...
      </div>
    );
  }

  /* ── Not available state ───────────────────── */

  if (!overview || !overview.available) {
    return (
      <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            Network
          </h3>
          <div className="rounded-lg bg-hs-card border border-hs-border p-4">
            <p className="text-sm text-hs-text-muted">
              Network settings are only available on the display device.
            </p>
            {overview?.reason && (
              <p className="text-xs text-hs-text-faint mt-1">
                {overview.reason}
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ── Derived data ──────────────────────────── */

  const interfaces = overview.interfaces ?? [];
  const wifiInterfaces = interfaces.filter((i) => i.type === 'wifi');
  const hasWifi = wifiInterfaces.length > 0;

  /* ── Full UI ───────────────────────────────── */

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* Hostname */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Hostname
        </h3>
        <p className="text-sm text-hs-text-primary font-mono">
          {overview.hostname}
        </p>
      </section>

      {/* Interfaces */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Interfaces
        </h3>
        {interfaces.length === 0 ? (
          <p className="text-xs text-hs-text-faint">No network interfaces detected.</p>
        ) : (
          <div className="space-y-2">
            {interfaces.map((iface) => {
              const isConnected = iface.state === 'connected';
              return (
                <div
                  key={iface.device}
                  className="rounded-lg bg-hs-card border border-hs-border p-3"
                >
                  {/* Primary line */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isConnected ? 'bg-hs-success' : 'bg-hs-text-faint'
                      }`}
                    />
                    <span className="text-sm text-hs-text-primary font-mono">
                      {iface.device}
                    </span>
                    <span className="text-sm text-hs-text-faint">
                      &mdash;
                    </span>
                    <span className={`text-sm ${isConnected ? 'text-hs-text-body' : 'text-hs-text-muted'}`}>
                      {getStateLabel(iface)}
                    </span>
                    {iface.isManagementInterface && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-warning/20 text-hs-warning px-1.5 py-0.5 rounded shrink-0">
                        mgmt
                      </span>
                    )}
                  </div>

                  {/* Secondary line */}
                  <div className="ml-4 mt-1 flex items-center gap-1.5 text-xs text-hs-text-muted">
                    <span>{getInterfaceTypeLabel(iface)}</span>
                    {iface.wifi && iface.wifi.signal > 0 && (
                      <>
                        <span className="text-hs-text-faint">&middot;</span>
                        <span>Signal {iface.wifi.signal}%</span>
                      </>
                    )}
                    {iface.ipv4 && (
                      <>
                        <span className="text-hs-text-faint">&middot;</span>
                        <span>{iface.ipv4.method === 'manual' ? 'Static' : 'DHCP'}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* WiFi Scan */}
      {hasWifi && (
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            Available WiFi Networks
          </h3>

          {/* Controls row */}
          <div className="flex items-center gap-3 mb-3">
            {wifiInterfaces.length > 1 && (
              <select
                value={selectedWifiIface}
                onChange={(e) => {
                  setSelectedWifiIface(e.target.value);
                  setScanResults([]);
                  setScanError(null);
                }}
                className="rounded-md bg-hs-input border border-hs-border text-sm text-hs-text-primary px-2 py-1"
              >
                {wifiInterfaces.map((iface) => (
                  <option key={iface.device} value={iface.device}>
                    {iface.device}
                  </option>
                ))}
              </select>
            )}
            {wifiInterfaces.length === 1 && (
              <span className="text-xs text-hs-text-muted">
                Scanning {selectedWifiIface}
              </span>
            )}
            <div className="ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleScan}
                disabled={scanning || cooldownRemaining > 0}
              >
                {scanning
                  ? 'Scanning...'
                  : cooldownRemaining > 0
                    ? `Scan (${cooldownRemaining}s)`
                    : 'Scan'}
              </Button>
            </div>
          </div>

          {/* Scan error */}
          {scanError && (
            <p className="text-xs text-hs-danger mb-3">{scanError}</p>
          )}

          {/* Scan results */}
          {scanResults.length > 0 ? (
            <div className="space-y-1">
              {scanResults.map((network) => (
                <div
                  key={`${network.ssid}-${network.bssid}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2 bg-hs-input border border-hs-border"
                >
                  {/* Signal bars */}
                  <SignalBars signal={network.signal} />

                  {/* SSID */}
                  <span className="text-sm text-hs-text-primary flex-1 truncate">
                    {network.ssid}
                  </span>

                  {/* Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {network.inUse && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-success/20 text-hs-success px-1.5 py-0.5 rounded">
                        Connected
                      </span>
                    )}
                    {!network.inUse && network.saved && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-accent/20 text-hs-accent px-1.5 py-0.5 rounded">
                        Saved
                      </span>
                    )}

                    {/* Signal percentage */}
                    <span className="text-xs text-hs-text-faint w-8 text-right">
                      {network.signal}%
                    </span>

                    {/* Lock icon for secured networks */}
                    {network.security !== '' && network.security !== 'Open' && (
                      <svg
                        className="w-3.5 h-3.5 text-hs-text-faint shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !scanning && scanResults.length === 0 && !scanError ? (
            <p className="text-xs text-hs-text-faint">
              Click Scan to search for nearby WiFi networks.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
