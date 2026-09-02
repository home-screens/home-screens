'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslate } from '@/i18n';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';
import { RESET_COMMAND, AUTH_FILE } from '@/lib/password-reset';

/**
 * Turn a login failure into a sentence in the reader's language.
 *
 * The route's `error` field is an English string meant for non-browser
 * callers; rendering it here left one red line of English in the middle of an
 * otherwise fully translated page. `code` is the contract the page reads, and
 * a rate-limited answer carries the wait so the message can say how long
 * rather than "later" — someone who has just been locked out and then types
 * the right password would otherwise read "too many attempts" and conclude
 * their password is wrong.
 */
function messageForFailure(
  data: { code?: unknown; retryAfterSeconds?: unknown; error?: unknown },
  t: ReturnType<typeof useTranslate>,
): string {
  if (data.code === 'invalid_password') return t('login.errors.wrongPassword');
  if (data.code === 'rate_limited') {
    const seconds = typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 0;
    // Round up, and never say "0 minutes": under a minute still reads as 1.
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return t('login.errors.tooManyTries', { count: minutes });
  }
  return typeof data.error === 'string' && data.error
    ? data.error
    : t('login.loginFailed');
}

function LoginForm() {
  const t = useTranslate('core');
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get('from') || '/editor';
  const from = rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/editor';

  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ipRestricted, setIpRestricted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // If already authenticated or auth is disabled, redirect immediately.
  // IMPORTANT: check ipRestricted BEFORE the authenticated redirect — otherwise
  // an authenticated user whose IP just got restricted would infinite-loop
  // between /editor and /login.
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (data.ipRestricted) {
          setIpRestricted(true);
        } else if (!data.authEnabled || data.authenticated) {
          window.location.href = from;
          return;
        }
      } catch {
        // If status check fails, show the login form
      }
      setChecking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    checkStatus();
  }, [from]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, rememberMe }),
      });

      if (res.ok) {
        window.location.href = from;
        return;
      }

      const data = await res.json();
      setError(messageForFailure(data, t));
      setPassword('');
    } catch {
      setError(t('login.unreachable'));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center text-hs-text-faint text-sm">
        {t('login.checkingAuth')}
      </div>
    );
  }

  return (
    // Scrolls in its own right: the auth layout clips at the viewport, and the
    // reset-password panel below can push the card past the fold on a phone.
    <div className="h-screen overflow-y-auto flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <HomeScreensLogo className="mb-4" />
          <p className="text-sm text-hs-text-faint">
            {ipRestricted ? t('login.ipBlocked') : t('login.enterPasswordToContinue')}
          </p>
        </div>

        {ipRestricted && (
          <div className="rounded-lg bg-hs-danger/10 border border-hs-danger/30 px-4 py-3 mb-4">
            <p className="text-sm font-medium text-hs-danger">{t('login.accessRestricted')}</p>
            <p className="text-xs text-hs-text-muted mt-1">
              {t('login.accessRestrictedDescription')}
            </p>
          </div>
        )}

        {!ipRestricted && <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder={t('login.passwordPlaceholder')}
              autoComplete="current-password"
              className="w-full rounded-lg bg-hs-input border border-hs-border-strong text-hs-text-body px-4 py-3 text-sm focus:outline-none focus:border-hs-accent placeholder:text-hs-text-faint"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="accent-hs-accent rounded"
            />
            <span className="text-sm text-hs-text-muted">{t('login.rememberMe')}</span>
          </label>

          {error && (
            <p className="text-sm text-hs-danger text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="w-full rounded-lg bg-hs-accent hover:bg-hs-accent-hover text-white font-medium py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('login.signingIn') : t('login.unlock')}
          </button>
        </form>}

        {/* Recovery lives here rather than only on the Security page, which is
            behind the very password this explains how to clear. */}
        {!ipRestricted && (
          <details className="mt-6">
            <summary className="text-xs text-hs-text-secondary hover:text-hs-text-muted transition-colors cursor-pointer text-center">
              {t('login.forgotPassword.link')}
            </summary>
            <div className="mt-3 rounded-lg bg-hs-card border border-hs-border-strong px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-hs-text-body">
                {t('login.forgotPassword.title')}
              </p>
              <p className="text-xs text-hs-text-muted">{t('login.forgotPassword.body')}</p>
              <code className="block text-xs text-hs-text-body bg-hs-input rounded px-2 py-1.5 break-all">
                {RESET_COMMAND}
              </code>
              <p className="text-xs text-hs-text-faint">
                {t('login.forgotPassword.fallback', { file: AUTH_FILE })}
              </p>
              <p className="text-xs text-hs-text-faint">{t('login.forgotPassword.after')}</p>
            </div>
          </details>
        )}

        <div className="text-center mt-6">
          <Link
            href="/display"
            className="text-xs text-hs-text-secondary hover:text-hs-text-muted transition-colors"
          >
            {t('login.backToDisplay')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  const t = useTranslate('core');
  return (
    <div className="h-screen flex items-center justify-center text-hs-text-faint text-sm">
      {t('login.loading')}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginForm />
    </Suspense>
  );
}
