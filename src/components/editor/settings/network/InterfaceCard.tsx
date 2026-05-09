'use client';

import Button from '@/components/ui/Button';
import { useTranslate, type TranslateFn } from '@/i18n';
import type { NetworkInterface } from './types';

/* ─── Helpers ──────────────────────────────── */

function getInterfaceTypeLabel(iface: NetworkInterface, t: TranslateFn): string {
  if (iface.type === 'ethernet') return t('settings.networkPage.interface.type.ethernet');
  if (iface.type === 'wifi') {
    if (iface.driver === 'brcmfmac') return t('settings.networkPage.interface.type.wifiBuiltIn');
    if (iface.driver) return t('settings.networkPage.interface.type.wifiUsb', { driver: iface.driver });
    return t('settings.networkPage.interface.type.wifi');
  }
  return iface.type;
}

function getStateLabel(iface: NetworkInterface, t: TranslateFn): string {
  if (iface.state === 'connected') {
    const baseLabel = iface.wifi?.ssid
      ? t('settings.networkPage.interface.state.connectedToSsid', { ssid: iface.wifi.ssid })
      : t('settings.networkPage.interface.state.connected');
    if (iface.ipv4?.address) {
      return t('settings.networkPage.interface.state.connectedWithAddress', {
        state: baseLabel,
        address: iface.ipv4.address,
      });
    }
    return baseLabel;
  }
  if (iface.state === 'disconnected') return t('settings.networkPage.interface.state.disconnected');
  if (iface.state === 'unavailable') return t('settings.networkPage.interface.state.unavailable');
  if (iface.state === 'unmanaged') return t('settings.networkPage.interface.state.unmanaged');
  // Unknown state from system: show capitalized raw value (locale-agnostic system value).
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
  const t = useTranslate('editor');
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
          {getStateLabel(iface, t)}
        </span>
        {iface.isManagementInterface && (
          <span className="text-[10px] uppercase tracking-wider bg-hs-warning/20 text-hs-warning px-1.5 py-0.5 rounded shrink-0">
            {t('settings.networkPage.interface.managementBadge')}
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
              {t('settings.networkPage.interface.ipSettingsButton')}
            </Button>
          )}
          {canDisconnect && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disconnecting}
              onClick={() => onDisconnect(iface.connectionUuid!, iface)}
            >
              {disconnecting
                ? t('settings.networkPage.interface.disconnectingButton')
                : t('settings.networkPage.interface.disconnectButton')}
            </Button>
          )}
        </div>
      </div>

      {/* Secondary line */}
      <div className="ml-4 mt-1 flex items-center gap-1.5 text-xs text-hs-text-muted">
        <span>{getInterfaceTypeLabel(iface, t)}</span>
        {iface.wifi && iface.wifi.signal > 0 && (
          <>
            <span className="text-hs-text-faint">&middot;</span>
            <span>{t('settings.networkPage.interface.signalLabel', { percent: iface.wifi.signal })}</span>
          </>
        )}
        {iface.ipv4 && (
          <>
            <span className="text-hs-text-faint">&middot;</span>
            <span>
              {iface.ipv4.method === 'manual'
                ? t('settings.networkPage.interface.addressing.static')
                : t('settings.networkPage.interface.addressing.dhcp')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
