'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
      <div className="h-screen flex items-center justify-center text-neutral-500 text-sm">
        Checking authentication...
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <HomeScreensLogo className="mb-4" />
          <p className="text-sm text-neutral-500">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-100 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder:text-neutral-600"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="accent-blue-500 rounded"
            />
            <span className="text-sm text-neutral-400">Remember me for 90 days</span>
          </label>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || loading}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Unlock'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a
            href="/display"
            className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            Back to display
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-neutral-500 text-sm">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
