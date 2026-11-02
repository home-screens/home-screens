'use client';

import Button from '@/components/ui/Button';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import type { GooglePhotosImport } from '@/hooks/useGooglePhotosImport';
import { useTranslate } from '@/i18n';

/**
 * Signing in to Google Photos once links come back to the hub: Google's
 * button, then waiting for the sign-in to land, with a paste box as the
 * fallback. Home Screens' own app and the household's own app share it, and
 * every surface that adds from Google Photos shows it the same way.
 */
export default function GooglePhotosSignIn({ google, intro = true }: {
  google: GooglePhotosImport;
  /** The line above Google's button; a compact strip leaves it out. */
  intro?: boolean;
}) {
  const t = useTranslate('editor');
  const { signInStep, setSignInStep, pasted, setPasted, busy, signIn, finishSignIn, startOver } = google;

  if (signInStep === 'waiting') {
    return (
      <div>
        <p className="mt-2 mb-2.5 flex items-center gap-2 text-xs text-hs-text-muted">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-hs-border-strong border-t-hs-accent-hover"
          />
          {t('configSections.googlePhotosImport.hosted.finishOnGoogle')}
        </p>
        <p className="text-[11px] leading-[1.45] text-hs-text-muted">
          {t('configSections.googlePhotosImport.hosted.comesBack')}{' '}
          <button
            type="button"
            onClick={() => setSignInStep('paste')}
            className="text-hs-text-faint underline hover:text-hs-text-muted"
          >
            {t('configSections.googlePhotosImport.hosted.pasteInstead')}
          </button>
        </p>
      </div>
    );
  }

  if (signInStep === 'paste') {
    return (
      <div>
        <p className="mt-0.5 text-[11px] leading-[1.45] text-hs-text-muted">
          {t('configSections.googlePhotosImport.hosted.pasteIntro')}
        </p>
        <input
          type="text"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={t('configSections.googlePhotosImport.pastePlaceholder')}
          className={`${INPUT_CLASS} mt-2`}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button size="sm" variant="primary" onClick={finishSignIn} disabled={busy || !pasted.trim()}>
            {t('configSections.googlePhotosImport.finishSignIn')}
          </Button>
          <button
            type="button"
            onClick={startOver}
            className="text-[11px] text-hs-text-faint underline hover:text-hs-text-muted"
          >
            {t('configSections.googlePhotosImport.hosted.startOver')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {intro && (
        <p className="mt-0.5 mb-2.5 text-[11px] leading-[1.45] text-hs-text-muted">
          {t('configSections.googlePhotosImport.hosted.intro')}
        </p>
      )}
      <GoogleSignInButton
        size="sm"
        label={t('configSections.googlePhotosImport.hosted.signIn')}
        onClick={signIn}
        disabled={busy}
      />
    </div>
  );
}
