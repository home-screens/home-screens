'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import HomeScreensLogo from '@/components/brand/HomeScreensLogo';

function LoginForm() {
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

  // If already authenticated or auth is disabled, redirect immediately
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        if (!data.authEnabled || data.authenticated) {
          window.location.href = from;
          return;
        }
        if (data.ipRestricted) {
          setIpRestricted(true);
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
      setError(data.error || 'Login failed');
      setPassword('');
    } catch {
      setError('Unable to reach server');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center text-hs-text-faint text-sm">
        Checking authentication...
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <HomeScreensLogo className="mb-4" />
          <p className="text-sm text-hs-text-faint">Enter your password to continue</p>
        </div>

        {ipRestricted && (
          <div className="rounded-lg bg-hs-danger/10 border border-hs-danger/30 px-4 py-3 mb-4">
            <p className="text-sm font-medium text-hs-danger">Access restricted</p>
            <p className="text-xs text-hs-text-muted mt-1">
              Your IP address is not in the allowed list. Even with the correct password,
              you won&apos;t be able to access this system. Contact an administrator to add your IP.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Password"
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
            <span className="text-sm text-hs-text-muted">Remember me for 90 days</span>
          </label>

          {error && (
            <p className="text-sm text-hs-danger text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="w-full rounded-lg bg-hs-accent hover:bg-hs-accent-hover text-white font-medium py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Unlock'}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link
            href="/display"
            className="text-xs text-hs-text-secondary hover:text-hs-text-muted transition-colors"
          >
            Back to display
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-hs-text-faint text-sm">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
