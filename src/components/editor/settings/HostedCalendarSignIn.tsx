'use client';

import Button from '@/components/ui/Button';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';
import { useTranslate } from '@/i18n';
import { DeviceCodeLink, useDeviceCodeCopy } from '../DeviceCodeParts';

interface Props {
  userCode: string | null;
  verificationUrl: string | null;
  polling: boolean;
  onStart: () => void;
  onCancel: () => void;
  error: string | null;
}

/**
 * Google Calendar sign-in with Home Screens' own Google app: Google's own
 * button, then the short code to type on a phone or computer. Same device
 * sign-in as a household's own app uses, in plainer words and with nothing
 * about setting up a Google project, since there is nothing to set up. The
 * page notices by itself when the sign-in lands.
 */
export default function HostedCalendarSignIn({
  userCode,
  verificationUrl,
  polling,
  onStart,
  onCancel,
  error,
}: Props) {
  const t = useTranslate('editor');
  const codeCopy = useDeviceCodeCopy(userCode);

  if (userCode && verificationUrl) {
    return (
      <div data-testid="google-calendar-code">
        <p className="text-[13px] text-hs-text-body">
          {t('settings.calendarPage.google.hosted.codeIntroPart1')}
          <DeviceCodeLink
            url={verificationUrl}
            short
            className="text-hs-accent hover:text-hs-accent-hover underline"
          />
          {t('settings.calendarPage.google.hosted.codeIntroPart2')}
        </p>
        <div className="mt-2.5 mb-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg border border-hs-border-strong bg-hs-input px-4 py-3 font-mono text-2xl font-semibold leading-none tracking-[0.12em] text-hs-text-primary">
            {userCode}
          </code>
          <Button onClick={codeCopy.copy}>{codeCopy.label}</Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-hs-text-muted">
          {polling && (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-hs-border-strong border-t-hs-accent-hover"
            />
          )}
          {t('settings.calendarPage.google.hosted.waiting')}
          <button
            type="button"
            onClick={onCancel}
            className="ml-1.5 text-hs-text-faint underline hover:text-hs-text-muted"
          >
            {t('settings.calendarPage.google.hosted.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="google-calendar-hosted-sign-in">
      <GoogleSignInButton
        label={t('common.signInWithGoogle')}
        onClick={onStart}
        disabled={polling}
      />
      {error && <p className="mt-2 text-xs text-hs-danger">{error}</p>}
      <p className="mt-2.5 text-xs text-hs-text-faint">
        {t('settings.calendarPage.google.hosted.help')}
      </p>
    </div>
  );
}
