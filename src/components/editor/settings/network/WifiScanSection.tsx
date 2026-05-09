'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { NetworkInterface, WifiNetwork } from './types';

/* ─── Constants ────────────────────────────── */

const SCAN_COOLDOWN_S = 15;

/* ─── Signal bar component ─────────────────── */

function SignalBars({ signal }: { signal: number }) {
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

/* ─── Props ────────────────────────────────── */

interface WifiScanSectionProps {
  wifiInterfaces: NetworkInterface[];
  selectedWifiIface: string;
  onSelectIface: (iface: string) => void;
  onNetworkClick: (network: WifiNetwork) => void;
}

/* ─── Component ────────────────────────────── */

export default function WifiScanSection({
  wifiInterfaces,
  selectedWifiIface,
  onSelectIface,
  onNetworkClick,
}: WifiScanSectionProps) {
  const t = useTranslate('editor');
  const [scanResults, setScanResults] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        data.sort((a, b) => b.signal - a.signal);
        setScanResults(data);
      } else {
        const errData = await res.json().catch(() => null);
        setScanError(errData?.error ?? t('settings.networkPage.wifiScan.defaultScanError'));
      }
    } catch {
      setScanError(t('settings.networkPage.wifiScan.networkErrorMessage'));
    } finally {
      setScanning(false);

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
  }, [selectedWifiIface, cooldownRemaining, t]);

  /* ── Cleanup cooldown timer on unmount ─────── */

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  /* ── Clear results when interface changes ──── */

  const handleIfaceChange = useCallback(
    (iface: string) => {
      onSelectIface(iface);
      setScanResults([]);
      setScanError(null);
    },
    [onSelectIface],
  );

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.networkPage.wifiScan.heading')}
      </h3>

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-3">
        {wifiInterfaces.length > 1 && (
          <select
            value={selectedWifiIface}
            onChange={(e) => handleIfaceChange(e.target.value)}
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
            {t('settings.networkPage.wifiScan.scanningInterface', { device: selectedWifiIface })}
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
              ? t('settings.networkPage.wifiScan.scanningButton')
              : cooldownRemaining > 0
                ? t('settings.networkPage.wifiScan.scanCooldownButton', { seconds: cooldownRemaining })
                : t('settings.networkPage.wifiScan.scanButton')}
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
            <button
              key={`${network.ssid}-${network.bssid}`}
              type="button"
              onClick={() => onNetworkClick(network)}
              className="flex items-center gap-3 rounded-md px-3 py-2 bg-hs-input border border-hs-border w-full text-left hover:bg-hs-hover transition-colors"
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
                    {t('settings.networkPage.wifiScan.badges.connected')}
                  </span>
                )}
                {!network.inUse && network.saved && (
                  <span className="text-[10px] uppercase tracking-wider bg-hs-accent/20 text-hs-accent px-1.5 py-0.5 rounded">
                    {t('settings.networkPage.wifiScan.badges.saved')}
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
            </button>
          ))}
        </div>
      ) : !scanning && scanResults.length === 0 && !scanError ? (
        <p className="text-xs text-hs-text-faint">
          {t('settings.networkPage.wifiScan.emptyHint')}
        </p>
      ) : null}
    </section>
  );
}
