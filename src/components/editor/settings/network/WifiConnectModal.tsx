'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import type { NetworkInterface, WifiNetwork } from './types';

/* ─── Props ────────────────────────────────── */

interface WifiConnectModalProps {
  /** Pre-selected network from scan results (null for hidden network entry) */
  network: WifiNetwork | null;
  /** SSID override for hidden networks */
  hiddenSsid?: string;
  /** Available WiFi interfaces */
  wifiInterfaces: NetworkInterface[];
  /** Pre-selected interface */
  selectedIface: string;
  /** Called on successful connection (with optional rollbackId for mgmt interface) */
  onConnected: (rollbackId?: string) => void;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called when a management interface warning is returned */
  onManagementWarning: (warning: string, retryWithConfirm: () => void) => void;
}

/* ─── Component ────────────────────────────── */

export default function WifiConnectModal({
  network,
  hiddenSsid,
  wifiInterfaces,
  selectedIface,
  onConnected,
  onClose,
  onManagementWarning,
}: WifiConnectModalProps) {
  const ssid = network?.ssid ?? hiddenSsid ?? '';
  const isOpen = network
    ? network.security === '' || network.security === 'Open'
    : false;

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [iface, setIface] = useState(selectedIface);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenSsidInput, setHiddenSsidInput] = useState(hiddenSsid ?? '');

  const effectiveSsid = network ? ssid : hiddenSsidInput;

  /* ── Escape to close ───────────────────────── */

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  /* ── Connect handler ───────────────────────── */

  const doConnectRef = useRef<((confirmed?: boolean) => Promise<void>) | null>(null);

  const doConnect = useCallback(
    async (confirmed?: boolean) => {
      if (!effectiveSsid.trim()) {
        setError('SSID is required');
        return;
      }

      setConnecting(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          ssid: effectiveSsid.trim(),
          iface,
        };
        if (!isOpen && password) {
          body.password = password;
        }
        if (confirmed) {
          body.confirmed = true;
        }

        const res = await editorFetch('/api/system/network/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.requiresConfirmation) {
          setConnecting(false);
          onManagementWarning(data.warning, () => doConnectRef.current?.(true));
          return;
        }

        if (!res.ok || data.ok === false) {
          setError(data.error ?? 'Connection failed');
          setConnecting(false);
          return;
        }

        onConnected(data.rollbackId);
      } catch {
        setError('Failed to reach server');
        setConnecting(false);
      }
    },
    [effectiveSsid, password, iface, isOpen, onConnected, onManagementWarning],
  );

  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doConnect();
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-4">
          {network ? `Connect to "${ssid}"` : 'Connect to Hidden Network'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hidden network: editable SSID */}
          {!network && (
            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                Network name (SSID)
              </label>
              <input
                type="text"
                value={hiddenSsidInput}
                onChange={(e) => setHiddenSsidInput(e.target.value)}
                className="w-full bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary focus:outline-none focus:border-hs-accent"
                placeholder="Enter network name"
                autoFocus
              />
            </div>
          )}

          {/* Password field (hidden for open networks) */}
          {!isOpen && (
            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-hs-bg border border-hs-border rounded px-3 py-2 pr-16 text-sm text-hs-text-primary focus:outline-none focus:border-hs-accent"
                  placeholder="Enter password"
                  autoFocus={!!network}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-hs-text-muted hover:text-hs-text-body px-1.5 py-0.5"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Interface selector */}
          {wifiInterfaces.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                Interface
              </label>
              <select
                value={iface}
                onChange={(e) => setIface(e.target.value)}
                className="w-full bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary focus:outline-none focus:border-hs-accent"
              >
                {wifiInterfaces.map((wi) => (
                  <option key={wi.device} value={wi.device}>
                    {wi.device}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-hs-danger/20 border border-hs-danger/30 px-3 py-2">
              <p className="text-xs text-hs-danger">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={onClose} disabled={connecting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={connecting || !effectiveSsid.trim()}>
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
