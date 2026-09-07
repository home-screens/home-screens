'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface Props {
  /** Called once the device accepted the password and wrote the grant. */
  onGranted: () => void;
  onCancel?: () => void;
  /** Tighter spacing for use inline under a settings control. */
  compact?: boolean;
}

/**
 * One-time device password prompt. Shown when a route or the update
 * preflight answers `needsSudoPassword`: the account running Home Screens
 * cannot use sudo without a password, so updates, WiFi and hostname changes
 * all stall. The password is sent once to /api/system/sudo-grant, which
 * hands it to sudo on stdin and writes the passwordless grant; nothing is
 * stored. After that the caller retries whatever it was doing.
 */
export default function SudoPasswordPrompt({ onGranted, onCancel, compact }: Props) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await editorFetch('/api/system/sudo-grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setPassword('');
        onGranted();
        return;
      }
      if (res.status === 429) {
        setError(t('sudoPrompt.tooManyTries', { minutes: data.retryAfterMinutes ?? 15 }));
      } else if (data.wrongPassword) {
        setError(t('sudoPrompt.wrongPassword'));
      } else {
        setError(data.error || t('sudoPrompt.genericError'));
      }
    } catch {
      setError(t('common.serverUnreachable'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="sudo-password-prompt"
      className={`rounded-lg border border-hs-warning/40 bg-hs-warning/10 ${compact ? 'mt-2 px-3 py-2.5' : 'px-4 py-3.5'}`}
    >
      <div className="flex items-start gap-2.5">
        <KeyRound size={16} className="text-hs-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-hs-text-primary">{t('sudoPrompt.title')}</p>
          <p className="mt-1 text-xs text-hs-text-secondary">{t('sudoPrompt.body')}</p>
          <p className="mt-1 text-xs text-hs-text-muted">{t('sudoPrompt.imageHint')}</p>
        </div>
      </div>

      <div className={`flex items-end gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-hs-text-secondary mb-1" htmlFor="sudo-device-password">
            {t('sudoPrompt.passwordLabel')}
          </label>
          <div className="relative">
            <input
              id="sudo-device-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={submitting}
              className="w-full bg-hs-bg border border-hs-border rounded px-3 py-2 pr-16 text-sm text-hs-text-primary focus:outline-none focus:border-hs-accent"
              placeholder={t('sudoPrompt.passwordPlaceholder')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-hs-text-muted hover:text-hs-text-body px-1.5 py-0.5"
            >
              {showPassword
                ? t('settings.networkPage.wifiConnect.hidePassword')
                : t('settings.networkPage.wifiConnect.showPassword')}
            </button>
          </div>
        </div>
        {onCancel && (
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={submitting}>
            {tCore('actions.cancel')}
          </Button>
        )}
        <Button variant="primary" size="sm" type="submit" disabled={submitting || !password}>
          {submitting ? t('sudoPrompt.workingButton') : t('sudoPrompt.allowButton')}
        </Button>
      </div>

      {error && <p className="mt-2 text-xs text-hs-danger">{error}</p>}
    </form>
  );
}
