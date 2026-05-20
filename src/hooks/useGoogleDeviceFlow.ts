'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';

interface UseGoogleDeviceFlowOptions {
  onSuccess: () => Promise<void>;
}

interface UseGoogleDeviceFlowReturn {
  userCode: string | null;
  verificationUrl: string | null;
  deviceFlowError: string | null;
  clientIdHint: string | null;
  deviceFlowPolling: boolean;
  startDeviceFlow: () => Promise<void>;
  clearError: () => void;
}

export function useGoogleDeviceFlow({ onSuccess }: UseGoogleDeviceFlowOptions): UseGoogleDeviceFlowReturn {
  const t = useTranslate('core');
  const [userCode, setUserCode] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);
  const [clientIdHint, setClientIdHint] = useState<string | null>(null);
  const [deviceFlowPolling, setDeviceFlowPolling] = useState(false);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    };
  }, []);

  const pollForToken = useCallback((code: string, interval: number, expiresIn: number) => {
    const deadline = Date.now() + expiresIn * 1000;
    const pollInterval = Math.max(interval, 5) * 1000;
    cancelledRef.current = false;

    const scheduleNext = (fn: () => void) => {
      pollingTimerRef.current = setTimeout(fn, pollInterval);
    };

    const poll = async () => {
      if (cancelledRef.current) return;
      if (Date.now() > deadline) {
        setDeviceFlowPolling(false);
        setDeviceFlowError(t('errors.codeExpired'));
        setUserCode(null);
        return;
      }
      try {
        const res = await editorFetch('/api/auth/google/device', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: code }),
        });
        if (cancelledRef.current) return;
        const data = await res.json();
        if (data.status === 'success') {
          setDeviceFlowPolling(false);
          setUserCode(null);
          if (data.error) setDeviceFlowError(data.error);
          await onSuccess();
          return;
        }
        if (data.status === 'pending') {
          scheduleNext(poll);
          return;
        }
        setDeviceFlowPolling(false);
        setDeviceFlowError(data.error || t('errors.authorizationFailed'));
        setUserCode(null);
      } catch {
        if (!cancelledRef.current) scheduleNext(poll);
      }
    };

    scheduleNext(poll);
  }, [onSuccess, t]);

  const startDeviceFlow = useCallback(async () => {
    cancelledRef.current = true;
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    setDeviceFlowError(null);
    setClientIdHint(null);
    setUserCode(null);
    try {
      const res = await editorFetch('/api/auth/google/device', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.clientIdHint) setClientIdHint(data.clientIdHint);
        throw new Error(data.error || t('errors.deviceFlowFailed'));
      }
      setUserCode(data.user_code);
      setVerificationUrl(data.verification_url);
      setDeviceFlowPolling(true);
      pollForToken(data.device_code, data.interval || 5, data.expires_in || 1800);
    } catch (err) {
      setDeviceFlowError(err instanceof Error ? err.message : t('errors.startSignInFailed'));
    }
  }, [pollForToken, t]);

  const clearError = useCallback(() => {
    setDeviceFlowError(null);
    setClientIdHint(null);
  }, []);

  return {
    userCode,
    verificationUrl,
    deviceFlowError,
    clientIdHint,
    deviceFlowPolling,
    startDeviceFlow,
    clearError,
  };
}
