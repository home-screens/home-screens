'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';
import SudoPasswordPrompt from '@/components/editor/SudoPasswordPrompt';
import { useTranslate } from '@/i18n';
import type { NetworkInterface, WifiNetwork } from '@/lib/network-types';
import { managementWarningText } from './management-warning';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { refusalSentence } from '@/lib/hub-request';

/* ─── Props ────────────────────────────────── */

interface WifiConnectModalProps {
  /** Pre-selected network from scan results (null for hidden network entry) */
  network: WifiNetwork | null;
  /** SSID override for hidden networks */
  hiddenSsid?: string;
  wifiInterfaces: NetworkInterface[];
  selectedIface: string;
  /** Called on successful connection (with optional rollbackId for mgmt interface) */
  onConnected: (rollbackId?: string) => void;
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
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const ssid = network?.ssid ?? hiddenSsid ?? '';
  const isOpen = network
    ? network.security === '' || network.security === 'Open'
    : false;

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [iface, setIface] = useState(selectedIface);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSudo, setNeedsSudo] = useState(false);
  const [hiddenSsidInput, setHiddenSsidInput] = useState(hiddenSsid ?? '');

  const effectiveSsid = network ? ssid : hiddenSsidInput;
  // A secured network needs a password, unless it is saved and the saved one
  // can be reused; a typed-in hidden name may be an open network
  const passwordMissing = !!network && !isOpen && !network.saved && !password;

  /* ── Connect handler ───────────────────────── */

  const doConnectRef = useRef<((confirmed?: boolean) => Promise<void>) | null>(null);

  const doConnect = useCallback(
    async (confirmed?: boolean) => {
      if (!effectiveSsid.trim()) {
        setError(t('settings.networkPage.wifiConnect.ssidRequiredError'));
        return;
      }

      setConnecting(true);
      setError(null);

      try {
        // The server builds one pinned profile per network per adapter from
        // these; the scan's security type picks WPA2 or WPA3 and a typed-in
        // name needs the hidden flag or NetworkManager never probes for it.
        const body: Record<string, unknown> = {
          ssid: effectiveSsid.trim(),
          iface,
          hidden: !network,
        };
        if (network) body.security = network.security;
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
          // The server itself gives the join 45 s; past that the reply is not coming
          timeoutMs: 90_000,
        });

        const data = await res.json();

        if (data.requiresConfirmation) {
          setConnecting(false);
          onManagementWarning(
            managementWarningText(t, data, window.location.port),
            () => doConnectRef.current?.(true),
          );
          return;
        }

        if (data.needsSudoPassword) {
          setNeedsSudo(true);
          setConnecting(false);
          return;
        }

        if (!res.ok) {
          setError(refusalSentence(data, tCore) ?? t('settings.networkPage.wifiConnect.defaultConnectError'));
          setConnecting(false);
          return;
        }

        onConnected(data.rollbackId);
      } catch {
        setError(tCore('refusals.unreachable'));
        setConnecting(false);
      }
    },
    [effectiveSsid, password, iface, isOpen, network, onConnected, onManagementWarning, t, tCore],
  );

  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doConnect();
  };

  return (
    <ModalFrame labelledBy="wifi-connect-title" onClose={onClose} className="w-full max-w-md">
      <ModalPanel>
        <ModalHeader
          titleId="wifi-connect-title"
          title={network
            ? t('settings.networkPage.wifiConnect.titleNamed', { ssid })
            : t('settings.networkPage.wifiConnect.titleHidden')}
          onClose={onClose}
        />

        <ModalBody>
          <form id="wifi-connect-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Hidden network: editable SSID */}
            {!network && (
              <div>
                <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                  {t('settings.networkPage.wifiConnect.ssidLabel')}
                </label>
                <input
                  type="text"
                  value={hiddenSsidInput}
                  onChange={(e) => setHiddenSsidInput(e.target.value)}
                  className={MODAL_INPUT_CLASS}
                  placeholder={t('settings.networkPage.wifiConnect.ssidPlaceholder')}
                  autoFocus
                />
              </div>
            )}

            {/* Password field (hidden for open networks) */}
            {!isOpen && (
              <div>
                <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                  {t('settings.networkPage.wifiConnect.passwordLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`pr-16 ${MODAL_INPUT_CLASS}`}
                    placeholder={
                      network?.saved
                        ? t('settings.networkPage.wifiConnect.savedPasswordPlaceholder')
                        : t('settings.networkPage.wifiConnect.passwordPlaceholder')
                    }
                    autoFocus={!!network}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-hs-text-muted hover:text-hs-text-body px-1.5 py-0.5"
                  >
                    {showPassword
                      ? t('settings.networkPage.wifiConnect.hidePassword')
                      : t('settings.networkPage.wifiConnect.showPassword')}
                  </button>
                </div>
              </div>
            )}

            {/* Interface selector */}
            {wifiInterfaces.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-hs-text-secondary mb-1">
                  {t('settings.networkPage.wifiConnect.interfaceLabel')}
                </label>
                <select
                  value={iface}
                  onChange={(e) => setIface(e.target.value)}
                  className={MODAL_INPUT_CLASS}
                >
                  {wifiInterfaces.map((wi) => (
                    <option key={wi.device} value={wi.device}>
                      {wi.device}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {needsSudo && (
              <SudoPasswordPrompt
                compact
                onGranted={() => {
                  setNeedsSudo(false);
                  doConnectRef.current?.();
                }}
                onCancel={() => setNeedsSudo(false)}
              />
            )}

            {/* Error */}
            {error && <Notice tone="danger" role="alert">{error}</Notice>}
          </form>
        </ModalBody>

        <ModalFooter
          onCancel={onClose}
          cancelLabel={t('settings.networkPage.wifiConnect.cancelButton')}
          cancelDisabled={connecting}
          primary={{
            label: connecting
              ? t('settings.networkPage.wifiConnect.connectingButton')
              : t('settings.networkPage.wifiConnect.connectButton'),
            type: 'submit',
            form: 'wifi-connect-form',
            disabled: connecting || !effectiveSsid.trim() || passwordMissing,
          }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
