'use client';

import { useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';
import type { AuthStatus } from './types';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';

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
  const tCore = useTranslate('core');
  /** What the hub said, in the household's language where it is a mistake we know. */
  const refusal = (data: { code?: string; minLength?: number; retryAfterMinutes?: number }, fallback: string) => {
    if (data.code === 'wrong_password') return tCore('login.errors.wrongPassword');
    if (data.code === 'password_too_short') return t('settings.securityPage.errors.passwordTooShort', { count: data.minLength ?? 8 });
    if (typeof data.retryAfterMinutes === 'number') return tCore('login.errors.tooManyTries', { count: data.retryAfterMinutes });
    return fallback;
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modalStatus, setModalStatus] = useState<ModalStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // How many displays are showing right now, for the line that says they
  // stay let in. Only asked when a first password is being set.
  const [showingCount, setShowingCount] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== 'set') return;
    let live = true;
    editorFetch('/api/display/walls')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { showingCount?: number } | null) => {
        if (live && data && typeof data.showingCount === 'number') setShowingCount(data.showingCount);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mode]);

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
          message: refusal(data, t('settings.securityPage.errors.setFailed')),
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
        message: tCore('refusals.hubUnreachable'),
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
          message: refusal(data, t('settings.securityPage.errors.changeFailed')),
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
        message: tCore('refusals.hubUnreachable'),
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
          message: refusal(data, t('settings.securityPage.errors.disableFailed')),
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
        message: tCore('refusals.hubUnreachable'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Escape and the backdrop are suspended mid-request, matching the Cancel
    // button, which is disabled for the same window.
    <ModalFrame
      labelledBy="security-password-title"
      onClose={onClose}
      closable={!submitting}
      className="w-full max-w-sm"
    >
      <ModalPanel>
        <ModalHeader
          titleId="security-password-title"
          title={mode === 'set' ? t('settings.securityPage.modal.setTitle')
            : mode === 'change' ? t('settings.securityPage.modal.changeTitle')
              : t('settings.securityPage.modal.disableTitle')}
          onClose={onClose}
          closable={!submitting}
        />

        <ModalBody>
          {/* Say what the password covers before asking for one. Reached from
              "Ask for a password on the family remote", the dialog has to
              answer the question that row raised; Security's own page never
              mentioned the remote at all. */}
          {mode === 'set' && (
            <FieldHint className="mb-4">
              {t('settings.securityPage.modal.setExplanation')}
            </FieldHint>
          )}

          <div className="space-y-3">
            {(mode === 'change' || mode === 'disable') && (
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setModalStatus(null); }}
                placeholder={t('settings.securityPage.modal.currentPasswordPlaceholder')}
                autoFocus
                className={`w-full ${SETTINGS_INPUT_CLASS}`}
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
                  className={`w-full ${SETTINGS_INPUT_CLASS}`}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setModalStatus(null); }}
                  placeholder={t('settings.securityPage.modal.confirmPasswordPlaceholder')}
                  className={`w-full ${SETTINGS_INPUT_CLASS}`}
                />
              </>
            )}

            {mode === 'disable' && (
              <FieldHint>
                {t('settings.securityPage.modal.disableWarning')}
              </FieldHint>
            )}

            {mode === 'set' && showingCount !== null && showingCount > 0 && (
              <p className="text-xs text-hs-text-muted border-t border-hs-border pt-3" data-testid="first-password-walls">
                <span className="font-medium text-hs-text-body">{t('settings.securityPage.modal.wallsStay', { count: showingCount })}</span>{' '}
                {t('settings.securityPage.modal.wallsOff')}
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
          </div>
        </ModalBody>

        <ModalFooter
          onCancel={onClose}
          cancelLabel={t('settings.securityPage.modal.cancel')}
          cancelDisabled={submitting}
          primary={mode === 'set' ? {
            label: submitting ? t('settings.securityPage.modal.setting') : t('settings.securityPage.modal.setSubmit'),
            onClick: handleSetPassword,
            disabled: !newPassword || !confirmPassword || submitting,
          } : mode === 'change' ? {
            label: submitting ? t('settings.securityPage.modal.changing') : t('settings.securityPage.modal.changeSubmit'),
            onClick: handleChangePassword,
            disabled: !currentPassword || !newPassword || !confirmPassword || submitting,
          } : {
            label: submitting ? t('settings.securityPage.modal.disabling') : t('settings.securityPage.modal.disableSubmit'),
            onClick: handleDisable,
            disabled: !currentPassword || submitting,
            variant: 'danger',
          }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
