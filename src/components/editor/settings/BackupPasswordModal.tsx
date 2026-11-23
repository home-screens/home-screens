'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/backup-credentials-types';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';

export interface BackupPasswordModalProps {
  /**
   * `set` — choosing a password for an export (needs confirmation).
   * `enter` — unlocking a backup file being restored (single field, and a
   * "restore without my keys" escape hatch so a forgotten password never
   * blocks the rest of the restore).
   */
  mode: 'set' | 'enter';
  /**
   * For `set`: `export` locks one downloaded file; `save` is the password
   * automatic backups keep on the hub and lock every copy with.
   */
  purpose?: 'export' | 'save';
  /**
   * For `enter` on an automatic backup: unlock it with the password saved on
   * the hub, which never comes to the browser. Offered first.
   */
  onUseSaved?: () => void;
  /** Shown above the fields after a failed attempt. */
  error?: string | null;
  busy?: boolean;
  onSubmit: (password: string) => void;
  onSkip?: () => void;
  onClose: () => void;
}

export default function BackupPasswordModal({
  mode,
  purpose = 'export',
  onUseSaved,
  error,
  busy = false,
  onSubmit,
  onSkip,
  onClose,
}: BackupPasswordModalProps) {
  const t = useTranslate('editor');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const tooShort = password.length > 0 && password.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = mode === 'set' && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    password.length >= MIN_PASSPHRASE_LENGTH &&
    (mode === 'enter' || password === confirmPassword) &&
    !busy;

  const localError = tooShort
    ? t('settings.dataPage.backupPassword.tooShort', { count: MIN_PASSPHRASE_LENGTH })
    : mismatch
      ? t('settings.dataPage.backupPassword.mismatch')
      : null;

  const submit = () => {
    if (canSubmit) onSubmit(password);
  };

  return (
    <ModalFrame
      labelledBy="backup-password-title"
      onClose={onClose}
      closable={!busy}
      className="w-full max-w-md"
    >
      <ModalPanel>
        <ModalHeader
          titleId="backup-password-title"
          title={mode === 'set'
            ? t('settings.dataPage.backupPassword.setTitle')
            : t('settings.dataPage.backupPassword.enterTitle')}
          onClose={onClose}
          closable={!busy}
        />
        <ModalBody>
          <FieldHint className="mb-4">
            {mode === 'set'
              ? purpose === 'save'
                ? t('settings.dataPage.backupPassword.saveDescription')
                : t('settings.dataPage.backupPassword.setDescription')
              : onUseSaved
                ? t('settings.dataPage.backupPassword.enterSavedDescription')
                : t('settings.dataPage.backupPassword.enterDescription')}
          </FieldHint>

          {mode === 'enter' && onUseSaved && (
            <Button variant="primary" onClick={onUseSaved} disabled={busy} className="mb-4">
              {t('settings.dataPage.backupPassword.useSaved')}
            </Button>
          )}

          {error && (
            <p className="text-xs text-hs-danger mb-3" role="alert">
              {error}
            </p>
          )}

          <label className="block text-sm text-hs-text-muted mb-1" htmlFor="backup-password">
            {mode === 'enter' && onUseSaved
              ? t('settings.dataPage.backupPassword.orTypeOne')
              : t('settings.dataPage.backupPassword.passwordLabel')}
          </label>
          <input
            id="backup-password"
            type="password"
            autoFocus={!onUseSaved}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className={`mb-3 ${MODAL_INPUT_CLASS}`}
          />

          {mode === 'set' && (
            <>
              <label className="block text-sm text-hs-text-muted mb-1" htmlFor="backup-password-confirm">
                {t('settings.dataPage.backupPassword.confirmLabel')}
              </label>
              <input
                id="backup-password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className={`mb-3 ${MODAL_INPUT_CLASS}`}
              />
            </>
          )}

          {localError && (
            <p className="text-xs text-hs-danger mb-3" role="alert">
              {localError}
            </p>
          )}

          {mode === 'set' && (
            <FieldHint>
              {t('settings.dataPage.backupPassword.noRecoveryNote')}
            </FieldHint>
          )}
        </ModalBody>

        <ModalFooter
          start={mode === 'enter' && onSkip ? (
            <button
              onClick={onSkip}
              disabled={busy}
              className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors disabled:opacity-50"
            >
              {t('settings.dataPage.backupPassword.skipButton')}
            </button>
          ) : undefined}
          onCancel={onClose}
          cancelDisabled={busy}
          primary={{
            label: busy
              ? t('settings.dataPage.fullBackup.working')
              : mode === 'set'
                ? purpose === 'save'
                  ? t('settings.dataPage.backupPassword.saveButton')
                  : t('settings.dataPage.backupPassword.continueButton')
                : t('settings.dataPage.backupPassword.unlockButton'),
            onClick: submit,
            disabled: !canSubmit,
            variant: onUseSaved ? 'secondary' : 'primary',
          }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
