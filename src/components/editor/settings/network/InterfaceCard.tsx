'use client';

import Button from '@/components/ui/Button';
import type { NetworkInterface } from './types';

/* ─── Helpers ──────────────────────────────── */

function getInterfaceTypeLabel(iface: NetworkInterface): string {
  if (iface.type === 'ethernet') return 'Ethernet';
  if (iface.type === 'wifi') {
    if (iface.driver === 'brcmfmac') return 'Built-in WiFi';
    if (iface.driver) return `USB WiFi (${iface.driver})`;
    return 'WiFi';
  }
  return iface.type;
}

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
  return iface.state.charAt(0).toUpperCase() + iface.state.slice(1);
}

/* ─── Props ────────────────────────────────── */

interface InterfaceCardProps {
  iface: NetworkInterface;
  onDisconnect: (connectionUuid: string, iface: NetworkInterface) => void;
  disconnecting?: boolean;
  ipSettingsOpen?: boolean;
  onToggleIPSettings?: (device: string) => void;
}

/* ─── Component ────────────────────────────── */

export default function InterfaceCard({
  iface,
  onDisconnect,
  disconnecting,
  ipSettingsOpen,
  onToggleIPSettings,
}: InterfaceCardProps) {
  const isConnected = iface.state === 'connected';
  const canDisconnect = isConnected && iface.type === 'wifi' && iface.connectionUuid;
  const canConfigureIP = iface.connectionUuid !== undefined;

  return (
    <div className="rounded-lg bg-hs-card border border-hs-border p-3">
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
        <span className="text-sm text-hs-text-faint">&mdash;</span>
        <span className={`text-sm ${isConnected ? 'text-hs-text-body' : 'text-hs-text-muted'}`}>
          {getStateLabel(iface)}
        </span>
        {iface.isManagementInterface && (
          <span className="text-[10px] uppercase tracking-wider bg-hs-warning/20 text-hs-warning px-1.5 py-0.5 rounded shrink-0">
            Your Connection
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {canConfigureIP && onToggleIPSettings && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleIPSettings(iface.device)}
              aria-expanded={ipSettingsOpen}
            >
              IP Settings
            </Button>
          )}
          {canDisconnect && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disconnecting}
              onClick={() => onDisconnect(iface.connectionUuid!, iface)}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          )}
        </div>
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
}
