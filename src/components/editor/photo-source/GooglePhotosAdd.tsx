'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';
import type { GooglePhotosImport } from '@/hooks/useGooglePhotosImport';
import { settingsPath } from '@/lib/settings-route';
import { useTranslate } from '@/i18n';
import GooglePhotosSignIn from './GooglePhotosSignIn';

/**
 * The button half of "add from Google Photos" for a library surface (the
 * Image Library's Local tab, the Pictures & videos page): Add from Google
 * Photos once signed in, Google's sign-in button before. Nothing shows until
 * the hub has said which it is, so neither flashes.
 */
export function GooglePhotosAction({ google, label }: { google: GooglePhotosImport; label?: string }) {
  const t = useTranslate('editor');
  if (google.appsLoading || !google.status) return null;
  if (!google.connected) {
    // Neither Home Screens' own app nor the household's is set up.
    if (!google.hosted && !google.status.credentialsConfigured) {
      return (
        <Link href={settingsPath({ kind: 'defaults', page: 'integrations' })} className="text-[11px] text-hs-accent hover:text-hs-accent-hover">
          {t('photoSources.google.needsSetup')}
        </Link>
      );
    }
    if (google.signInStep !== 'start') return null;
    return <GoogleSignInButton size="sm" label={t('photoSources.google.signInToAdd')} onClick={google.signIn} disabled={google.busy} />;
  }
  return (
    <Button size="sm" onClick={google.choosePhotos} disabled={google.busy || !!google.session || google.importing} data-testid="google-photos-add">
      {label ?? t('photoSources.google.add')}
    </Button>
  );
}

/**
 * The lines under the row while something is happening: finishing the
 * sign-in, waiting for picks, adding, and what landed.
 */
export function GooglePhotosProgress({ google, folderLabel }: { google: GooglePhotosImport; folderLabel: string }) {
  const t = useTranslate('editor');
  const { job } = google;
  const lines: React.ReactNode[] = [];
  if (!google.connected && google.signInStep !== 'start') {
    lines.push(<GooglePhotosSignIn key="sign-in" google={google} intro={false} />);
  } else if (google.session) {
    lines.push(
      <p key="waiting" className="text-[11px] text-hs-text-muted">
        <span className="animate-pulse">{t('photoSources.google.waiting')}</span>{' '}
        <a href={google.session.pickerUri} target="_blank" rel="noreferrer" className="text-hs-accent hover:text-hs-accent-hover">
          {t('photoSources.google.openAgain')}
        </a>
        {' · '}
        <button type="button" onClick={google.cancelPicking} className="text-hs-text-faint hover:text-hs-text-muted">
          {t('photoSources.google.cancel')}
        </button>
      </p>,
    );
  } else if (google.importing) {
    lines.push(
      <p key="adding" className="text-[11px] text-hs-text-muted">
        {t('photoSources.google.adding', { done: (job?.done ?? 0) + (job?.skipped ?? 0), total: job?.total ?? 0, folder: folderLabel })}
      </p>,
    );
  } else if (google.jobSucceeded && job) {
    lines.push(
      <p key="done" className="text-[11px] text-hs-success">
        {[
          job.done > 0 ? t('photoSources.google.added', { count: job.done }) : null,
          job.skipped > 0 ? t('photoSources.google.alreadyHere', { count: job.skipped }) : null,
          google.unsavedCount > 0 ? t('photoSources.google.notSaved', { count: google.unsavedCount }) : null,
        ].filter(Boolean).join(' ')}
      </p>,
    );
  } else if (google.jobFailed) {
    lines.push(<p key="failed" className="text-[11px] text-hs-warning">{t('configSections.googlePhotosImport.allFailed')}</p>);
  }
  if (google.startErrorText) lines.push(<p key="start-error" className="text-[11px] text-hs-warning">{google.startErrorText}</p>);
  if (google.error) lines.push(<p key="error" className="text-[11px] text-hs-warning">{google.error}</p>);
  if (lines.length === 0) return null;
  return <div className="space-y-1" data-testid="google-photos-progress">{lines}</div>;
}
