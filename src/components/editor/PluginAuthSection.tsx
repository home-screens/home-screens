'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import StatusDot from '@/components/ui/StatusDot';
import type { PluginAuth } from '@/types/plugins';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('plugin-auth-ui');

const DEVICE_POLL_MS = 4000;

interface AuthStatus {
  connected: boolean;
  expiresAt?: number;
  pending?: boolean;
}

/**
 * The "Connection" panel for a plugin declaring a server-side auth adapter.
 * The rendered controls depend on the manifest's flow:
 *   - authorization_code: shows the redirect URL to register + a popup Connect
 *   - device_code: shows a user code + verification URL, polls to completion
 *   - client_credentials: a single Connect button (secrets only)
 *   - garmin: email/password, with a first-class one-time-code (MFA) step
 */
export default function PluginAuthSection({
  pluginId,
  auth,
}: {
  pluginId: string;
  auth: PluginAuth;
}) {
  const t = useTranslate('editor');
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Garmin fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  // Device flow display
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUrl: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Popup (authorization_code) bookkeeping, ref-tracked so unmount can tear
  // both down — a function-local interval/listener would leak past unmount.
  const popupCloseCheck = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupListener = useRef<((event: MessageEvent) => void) | null>(null);

  const cleanupPopupWatch = useCallback(() => {
    if (popupCloseCheck.current) {
      clearInterval(popupCloseCheck.current);
      popupCloseCheck.current = null;
    }
    if (popupListener.current) {
      window.removeEventListener('message', popupListener.current);
      popupListener.current = null;
    }
  }, []);

  const base = `/api/plugins/auth/${encodeURIComponent(pluginId)}`;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await editorFetch(`${base}/status`);
      if (res.ok) setStatus(await res.json());
    } catch (err) {
      log.debug('Failed to fetch plugin auth status:', err);
    }
  }, [base]);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      cleanupPopupWatch();
    };
  }, [fetchStatus, cleanupPopupWatch]);

  function resetTransient() {
    setError('');
    setMfaRequired(false);
    setMfaCode('');
    setDeviceCode(null);
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }

  // --- Device flow polling ---
  const pollDevice = useCallback(async () => {
    try {
      const res = await editorFetch(`${base}/poll`, { method: 'PUT' });
      const data = await res.json();
      if (data.status === 'connected') {
        setDeviceCode(null);
        setBusy(false);
        await fetchStatus();
        return;
      }
      if (data.status === 'pending') {
        pollTimer.current = setTimeout(pollDevice, DEVICE_POLL_MS);
        return;
      }
      // expired / denied
      setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
      setDeviceCode(null);
      setBusy(false);
    } catch (err) {
      log.debug('Device poll failed:', err);
      setBusy(false);
    }
  }, [base, fetchStatus, t]);

  // --- OAuth2 authorization_code popup ---
  const connectAuthCode = useCallback(async () => {
    resetTransient();
    setBusy(true);
    try {
      const res = await editorFetch(`${base}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
        setBusy(false);
        return;
      }
      const popup = window.open(data.authUrl, 'plugin-auth', 'width=520,height=680');
      // A blocked popup returns null: `popup?.closed` would stay undefined
      // forever, so bail now instead of hanging on "Connecting…".
      if (!popup) {
        setError(t('settings.pluginAuth.popupBlocked'));
        setBusy(false);
        return;
      }
      // Replace any prior watch before arming a new one.
      cleanupPopupWatch();
      const onMessage = (event: MessageEvent) => {
        // Only trust messages from our own callback page.
        if (event.origin !== window.location.origin) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'plugin-auth-success') {
          cleanupPopupWatch();
          setBusy(false);
          fetchStatus();
        } else if (msg.type === 'plugin-auth-error') {
          cleanupPopupWatch();
          setError(msg.error ?? t('settings.pluginAuth.errorGeneric'));
          setBusy(false);
        }
      };
      popupListener.current = onMessage;
      window.addEventListener('message', onMessage);
      // If the user closes the popup without finishing, stop showing "busy".
      popupCloseCheck.current = setInterval(() => {
        if (popup.closed) {
          cleanupPopupWatch();
          setBusy(false);
          fetchStatus();
        }
      }, 800);
    } catch (err) {
      log.debug('Auth-code connect failed:', err);
      setBusy(false);
    }
  }, [base, fetchStatus, t, cleanupPopupWatch]);

  // --- OAuth2 device_code ---
  const connectDevice = useCallback(async () => {
    resetTransient();
    setBusy(true);
    try {
      const res = await editorFetch(`${base}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
        setBusy(false);
        return;
      }
      setDeviceCode({ userCode: data.userCode, verificationUrl: data.verificationUrl });
      pollTimer.current = setTimeout(pollDevice, DEVICE_POLL_MS);
    } catch (err) {
      log.debug('Device connect failed:', err);
      setBusy(false);
    }
  }, [base, pollDevice, t]);

  // --- OAuth2 client_credentials ---
  const connectClientCredentials = useCallback(async () => {
    resetTransient();
    setBusy(true);
    try {
      const res = await editorFetch(`${base}/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
      await fetchStatus();
    } catch (err) {
      log.debug('Client-credentials connect failed:', err);
    } finally {
      setBusy(false);
    }
  }, [base, fetchStatus, t]);

  // --- Garmin sign-in ---
  const signInGarmin = useCallback(async () => {
    if (!email.trim() || !password) return;
    setError('');
    setBusy(true);
    try {
      const res = await editorFetch(`${base}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
        return;
      }
      if (data.status === 'mfa_required') {
        setMfaRequired(true);
        setPassword('');
        return;
      }
      // connected
      setPassword('');
      await fetchStatus();
    } catch (err) {
      log.debug('Garmin sign-in failed:', err);
    } finally {
      setBusy(false);
    }
  }, [base, email, password, fetchStatus, t]);

  const submitMfa = useCallback(async () => {
    if (!mfaCode.trim()) return;
    setError('');
    setBusy(true);
    try {
      const res = await editorFetch(`${base}/poll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaCode: mfaCode.trim() }),
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setMfaRequired(false);
        setMfaCode('');
        setEmail('');
        await fetchStatus();
        return;
      }
      // still mfa_required (wrong code) or error
      setError(data.error ?? t('settings.pluginAuth.errorGeneric'));
    } catch (err) {
      log.debug('MFA submit failed:', err);
    } finally {
      setBusy(false);
    }
  }, [base, mfaCode, fetchStatus, t]);

  const disconnect = useCallback(async () => {
    resetTransient();
    setBusy(true);
    try {
      await editorFetch(base + '/disconnect', { method: 'DELETE' });
      setEmail('');
      setPassword('');
      await fetchStatus();
    } catch (err) {
      log.debug('Disconnect failed:', err);
    } finally {
      setBusy(false);
    }
  }, [base, fetchStatus]);

  // Trigger connect from a plugin's own embedded button (__HS_SDK__.startAuth).
  const startConnect = useCallback(() => {
    if (auth.type === 'garmin') return; // needs credentials typed into the panel
    if (auth.flow === 'authorization_code') return connectAuthCode();
    if (auth.flow === 'device_code') return connectDevice();
    return connectClientCredentials();
  }, [auth, connectAuthCode, connectDevice, connectClientCredentials]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.pluginId === pluginId) startConnect();
    };
    window.addEventListener('hs-plugin-start-auth', handler);
    return () => window.removeEventListener('hs-plugin-start-auth', handler);
  }, [pluginId, startConnect]);

  // ── Rendering ──────────────────────────────────────────────
  if (status === null) {
    return <p className="text-xs text-hs-text-faint">{t('settings.pluginAuth.loading')}</p>;
  }

  if (status.connected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-hs-text-body">
            <StatusDot configured />
            {t('settings.pluginAuth.connectedLabel')}
          </span>
          <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
            {t('settings.pluginAuth.disconnectButton')}
          </Button>
        </div>
        <p className="text-xs text-hs-text-faint">{t('settings.pluginAuth.autoRenewNote')}</p>
      </div>
    );
  }

  const redirectUri =
    typeof window !== 'undefined' ? `${window.location.origin}/api/plugins/auth/callback` : '';

  return (
    <div className="space-y-3">
      {auth.type === 'garmin' ? (
        <div className="space-y-2">
          <p className="text-xs text-hs-text-muted">{t('settings.pluginAuth.garmin.intro')}</p>
          {!mfaRequired ? (
            <>
              <input
                type="email"
                value={email}
                autoComplete="off"
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('settings.pluginAuth.garmin.emailPlaceholder')}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('settings.pluginAuth.garmin.passwordPlaceholder')}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={signInGarmin}
                disabled={busy || !email.trim() || !password}
              >
                {busy ? t('settings.pluginAuth.connecting') : t('settings.pluginAuth.garmin.signInButton')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-hs-text-muted">{t('settings.pluginAuth.garmin.mfaSent')}</p>
              <input
                type="text"
                inputMode="numeric"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder={t('settings.pluginAuth.garmin.mfaPlaceholder')}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
              <Button variant="primary" size="sm" onClick={submitMfa} disabled={busy || !mfaCode.trim()}>
                {busy ? t('settings.pluginAuth.connecting') : t('settings.pluginAuth.garmin.mfaButton')}
              </Button>
            </>
          )}
        </div>
      ) : auth.flow === 'device_code' && deviceCode ? (
        <div className="space-y-2">
          <p className="text-xs text-hs-text-muted">
            {t('settings.pluginAuth.deviceCodeIntro')}
          </p>
          <a
            href={deviceCode.verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-hs-accent underline break-all"
          >
            {deviceCode.verificationUrl}
          </a>
          <div className="text-center font-mono text-lg tracking-widest text-hs-text-body bg-hs-card border border-hs-border-strong rounded-md py-2">
            {deviceCode.userCode}
          </div>
          <p className="text-xs text-hs-text-faint">{t('settings.pluginAuth.devicePolling')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {auth.type === 'oauth2' && auth.flow === 'authorization_code' && (
            <div className="space-y-1">
              <p className="text-xs text-hs-text-muted">{t('settings.pluginAuth.redirectUriLabel')}</p>
              <code className="block text-[11px] text-hs-text-body bg-hs-card border border-hs-border-strong rounded-md px-2 py-1.5 break-all">
                {redirectUri}
              </code>
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={
              auth.type === 'oauth2' && auth.flow === 'authorization_code'
                ? connectAuthCode
                : auth.type === 'oauth2' && auth.flow === 'device_code'
                ? connectDevice
                : connectClientCredentials
            }
            disabled={busy}
          >
            {busy ? t('settings.pluginAuth.connecting') : t('settings.pluginAuth.connectButton')}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-hs-danger">{error}</p>}
    </div>
  );
}
