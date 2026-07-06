'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

type RevokeStatusKind = 'success' | 'error';
interface RevokeStatus {
  message: string;
  kind: RevokeStatusKind;
}

/** "Log out all devices" confirm-then-revoke flow. Redirects to /login on success. */
export default function SessionRevocation() {
  const t = useTranslate('editor');

  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState<RevokeStatus | null>(null);

  async function handleRevokeAll() {
    setRevoking(true);
    setRevokeStatus(null);
    try {
      const res = await editorFetch('/api/auth/revoke-sessions', { method: 'POST' });
      if (res.ok) {
        setRevokeConfirm(false);
        setRevokeStatus({
          message: t('settings.securityPage.revokeSessions.success'),
          kind: 'success',
        });
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } else {
        setRevokeStatus({
          message: t('settings.securityPage.revokeSessions.failed'),
          kind: 'error',
        });
      }
    } catch {
      setRevokeStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      {!revokeConfirm ? (
        <Button variant="secondary" size="sm" onClick={() => setRevokeConfirm(true)}>
          {t('settings.securityPage.revokeSessions.button')}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-hs-warning">
            {t('settings.securityPage.revokeSessions.warning')}
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRevokeAll}
            disabled={revoking}
          >
            {revoking
              ? t('settings.securityPage.revokeSessions.revoking')
              : t('settings.securityPage.revokeSessions.confirmButton')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRevokeConfirm(false)}
          >
            {t('settings.securityPage.revokeSessions.cancel')}
          </Button>
        </div>
      )}
      {revokeStatus && (
        <p
          className={`text-xs mt-1 ${
            revoking
              ? 'text-hs-text-muted'
              : revokeStatus.kind === 'success'
                ? 'text-hs-success'
                : 'text-hs-danger'
          }`}
          aria-live="polite"
          role={revokeStatus.kind === 'error' ? 'alert' : undefined}
        >
          {revokeStatus.message}
        </p>
      )}
    </div>
  );
}
