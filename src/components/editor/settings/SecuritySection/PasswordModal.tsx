'use client';

import { useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { AuthStatus } from './types';

// Status discriminants — kind drives styling/role explicitly so we never
// sniff English prefixes from translated messages.
type ModalStatusKind = 'success' | 'error';
interface ModalStatus {
  message: string;
  kind: ModalStatusKind;
}

interface PasswordModalProps {
  mode: 'set' | 'change' | 'disable';
  onClose: () => void;
  /** Auth status changed as a result of set/disable. */
  onStatusChange: (status: AuthStatus) => void;
  /** Display token fetched after set, or cleared (null) after disable. */
  onDisplayTokenChange: (token: string | null) => void;
}

/**
 * The set/change/disable password dialog. Owns its form fields and
 * submit state; field state resets naturally on unmount when the parent
 * closes the modal.
 */
export default function PasswordModal({ mode, onClose, onStatusChange, onDisplayTokenChange }: PasswordModalProps) {
  const t = useTranslate('editor');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modalStatus, setModalStatus] = useState<ModalStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSetPassword() {
    if (newPassword !== confirmPassword) {
      setModalStatus({ message: t('settings.securityPage.errors.passwordsDoNotMatch'), kind: 'error' });
      return;
    }
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.setFailed'),
          kind: 'error',
        });
        return;
      }
      onStatusChange({ authEnabled: true, authenticated: true, hasDisplayToken: true });
      // Fetch the auto-generated display token so the UI shows it immediately
      const tokenRes = await editorFetch('/api/auth/display-token');
      if (tokenRes.ok) {
        const { displayToken: tok } = await tokenRes.json();
        onDisplayTokenChange(tok);
      }
      setModalStatus({
        message: t('settings.securityPage.success.passwordSet'),
        kind: 'success',
      });
      setTimeout(onClose, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setModalStatus({ message: t('settings.securityPage.errors.passwordsDoNotMatch'), kind: 'error' });
      return;
    }
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.changeFailed'),
          kind: 'error',
        });
        return;
      }
      setModalStatus({
        message: t('settings.securityPage.success.passwordChanged'),
        kind: 'success',
      });
      setTimeout(onClose, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.disableFailed'),
          kind: 'error',
        });
        return;
      }
      onStatusChange({ authEnabled: false, authenticated: false, hasDisplayToken: false });
      // Clear stale token state so re-enabling doesn't show the old token.
      // The token panel unmounts when the token goes null, resetting its
      // reveal/copy/regenerate sub-state with it.
      onDisplayTokenChange(null);
      setModalStatus({
        message: t('settings.securityPage.success.authDisabled'),
        kind: 'success',
      });
      setTimeout(onClose, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-hs-panel border border-hs-border-strong rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h4 className="text-sm font-medium text-hs-text-body mb-4">
          {mode === 'set' && t('settings.securityPage.modal.setTitle')}
          {mode === 'change' && t('settings.securityPage.modal.changeTitle')}
          {mode === 'disable' && t('settings.securityPage.modal.disableTitle')}
        </h4>

        {/* Say what the password covers before asking for one. Reached from
            "Ask for a password on the family remote", the dialog has to
            answer the question that row raised; Security's own page never
            mentioned the remote at all. */}
        {mode === 'set' && (
          <p className="-mt-2 mb-4 text-xs text-hs-text-faint">
            {t('settings.securityPage.modal.setExplanation')}
          </p>
        )}

        <div className="space-y-3">
          {(mode === 'change' || mode === 'disable') && (
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setModalStatus(null); }}
              placeholder={t('settings.securityPage.modal.currentPasswordPlaceholder')}
              autoFocus
              className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            />
          )}

          {(mode === 'set' || mode === 'change') && (
            <>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setModalStatus(null); }}
                placeholder={t('settings.securityPage.modal.newPasswordPlaceholder')}
                autoFocus={mode === 'set'}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setModalStatus(null); }}
                placeholder={t('settings.securityPage.modal.confirmPasswordPlaceholder')}
                className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </>
          )}

          {mode === 'disable' && (
            <p className="text-xs text-hs-text-faint">
              {t('settings.securityPage.modal.disableWarning')}
            </p>
          )}

          {modalStatus && (
            <p
              className={`text-xs ${modalStatus.kind === 'success' ? 'text-hs-success' : 'text-hs-danger'}`}
              aria-live="polite"
              role={modalStatus.kind === 'error' ? 'alert' : undefined}
            >
              {modalStatus.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              {t('settings.securityPage.modal.cancel')}
            </Button>
            {mode === 'set' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSetPassword}
                disabled={!newPassword || !confirmPassword || submitting}
              >
                {submitting
                  ? t('settings.securityPage.modal.setting')
                  : t('settings.securityPage.modal.setSubmit')}
              </Button>
            )}
            {mode === 'change' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword || submitting}
              >
                {submitting
                  ? t('settings.securityPage.modal.changing')
                  : t('settings.securityPage.modal.changeSubmit')}
              </Button>
            )}
            {mode === 'disable' && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisable}
                disabled={!currentPassword || submitting}
              >
                {submitting
                  ? t('settings.securityPage.modal.disabling')
                  : t('settings.securityPage.modal.disableSubmit')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
