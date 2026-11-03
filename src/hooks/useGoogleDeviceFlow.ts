'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { useDeviceCodeSignIn, type DeviceCodePoll } from '@/hooks/useDeviceCodeSignIn';

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
  /** Stop waiting for this code; the code simply expires at Google. */
  cancel: () => void;
  clearError: () => void;
}

/**
 * Google Calendar's device-code sign-in: the shared poll loop against the
 * calendar's own endpoint, plus the two things only Google has, a masked
 * client id to check when starting fails and a warning a sign-in can
 * succeed with (no refresh token).
 */
export function useGoogleDeviceFlow({ onSuccess }: UseGoogleDeviceFlowOptions): UseGoogleDeviceFlowReturn {
  const t = useTranslate('core');
  const te = useTranslate('editor');
  const [clientIdHint, setClientIdHint] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // The device code is the hub's handle on the flow, so every poll carries it.
  const deviceCodeRef = useRef<string | null>(null);

  const signIn = useDeviceCodeSignIn({
    start: async () => {
      setClientIdHint(null);
      setWarning(null);
      const res = await editorFetch('/api/auth/google/device', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.clientIdHint) setClientIdHint(data.clientIdHint);
        throw new Error(data.error || t('errors.deviceFlowFailed'));
      }
      deviceCodeRef.current = data.device_code;
      return {
        userCode: data.user_code,
        verificationUrl: data.verification_url,
        intervalMs: (data.interval || 5) * 1000,
        expiresInMs: (data.expires_in || 1800) * 1000,
      };
    },
    poll: async (): Promise<DeviceCodePoll> => {
      const res = await editorFetch('/api/auth/google/device', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCodeRef.current }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (data.error) setWarning(data.error);
        return { status: 'connected' };
      }
      if (data.status === 'pending') return { status: 'pending', slowDown: data.slowDown === true };
      return { status: 'ended', message: data.error || t('errors.authorizationFailed') };
    },
    onConnected: onSuccess,
    words: {
      codeExpired: t('errors.codeExpired'),
      hubUnreachable: te('deviceSignIn.hubUnreachable'),
    },
  });

  const clearSignInError = signIn.clearError;
  const clearError = useCallback(() => {
    clearSignInError();
    setWarning(null);
    setClientIdHint(null);
  }, [clearSignInError]);

  return {
    userCode: signIn.code?.userCode ?? null,
    verificationUrl: signIn.code?.verificationUrl ?? null,
    deviceFlowError: signIn.error ?? warning,
    clientIdHint,
    deviceFlowPolling: signIn.busy,
    startDeviceFlow: signIn.start,
    cancel: signIn.cancel,
    clearError,
  };
}
