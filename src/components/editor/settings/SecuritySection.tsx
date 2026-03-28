'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';

interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
  hasDisplayToken: boolean;
}

export default function SecuritySection() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<'set' | 'change' | 'disable' | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Display token state
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRegenerating, setTokenRegenerating] = useState(false);
  const [tokenConfirmRegen, setTokenConfirmRegen] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          // Fetch display token if auth is enabled and user is authenticated
          if (data.authEnabled && data.authenticated) {
            const tokenRes = await editorFetch('/api/auth/display-token');
            if (tokenRes.ok) {
              const { displayToken: token } = await tokenRes.json();
              setDisplayToken(token);
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  function resetModal() {
    setModal(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  }

  async function handleSetPassword() {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to set password');
        return;
      }
      setStatus({ authEnabled: true, authenticated: true, hasDisplayToken: true });
      // Fetch the auto-generated display token so the UI shows it immediately
      const tokenRes = await editorFetch('/api/auth/display-token');
      if (tokenRes.ok) {
        const { displayToken: tok } = await tokenRes.json();
        setDisplayToken(tok);
      }
      setSuccess('Password set! Authentication is now enabled.');
      setTimeout(resetModal, 2000);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to change password');
        return;
      }
      setSuccess('Password changed. All other sessions have been invalidated.');
      setTimeout(resetModal, 2000);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to disable authentication');
        return;
      }
      setStatus({ authEnabled: false, authenticated: false, hasDisplayToken: false });
      // Clear stale token state so re-enabling doesn't show the old token
      setDisplayToken(null);
      setTokenRevealed(false);
      setTokenCopied(false);
      setTokenConfirmRegen(false);
      setTokenError(null);
      setSuccess('Authentication disabled.');
      setTimeout(resetModal, 2000);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyToken() {
    if (!displayToken) return;
    try {
      await navigator.clipboard.writeText(displayToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts (HTTP)
      try {
        const ta = document.createElement('textarea');
        ta.value = displayToken;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) { setTokenError('Copy failed — select and copy manually'); return; }
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
      } catch {
        setTokenError('Copy failed — select and copy manually');
      }
    }
  }

  async function handleRegenerateToken() {
    setTokenRegenerating(true);
    setTokenError(null);
    try {
      const res = await editorFetch('/api/auth/display-token', { method: 'POST' });
      if (res.ok) {
        const { displayToken: token } = await res.json();
        setDisplayToken(token);
        setTokenConfirmRegen(false);
        setTokenRevealed(true);
      } else {
        setTokenError('Failed to regenerate token');
      }
    } catch {
      setTokenError('Network error');
    } finally {
      setTokenRegenerating(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <section>
        <p className="text-xs text-neutral-500">Checking authentication status...</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
        Authentication
      </h3>
      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.authEnabled ? 'bg-green-400' : 'bg-neutral-600'
            }`}
          />
          <span className="text-sm text-neutral-300">
            {status?.authEnabled
              ? 'Authentication is enabled'
              : 'Authentication is disabled'}
          </span>
        </div>

        {!status?.authEnabled && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Set a password to protect the editor and API endpoints.
              A display token will be auto-generated so the display can authenticate seamlessly.
            </p>
            <Button variant="primary" size="sm" onClick={() => setModal('set')}>
              Set Password
            </Button>
          </div>
        )}

        {status?.authEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setModal('change')}>
                Change Password
              </Button>
              <Button variant="danger" size="sm" onClick={() => setModal('disable')}>
                Disable Authentication
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Log Out
              </Button>
            </div>

            {/* Display Token */}
            {displayToken && (
              <div className="mt-4 pt-4 border-t border-neutral-800">
                <h4 className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
                  Display Token
                </h4>
                <p className="text-xs text-neutral-500 mb-2">
                  The display uses this token to authenticate API requests. It was auto-generated when you set a password.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-neutral-300 font-mono truncate select-all">
                    {tokenRevealed ? displayToken : displayToken.slice(0, 8) + '\u2022'.repeat(16)}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTokenRevealed(!tokenRevealed)}
                  >
                    {tokenRevealed ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleCopyToken}>
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div className="mt-2">
                  {!tokenConfirmRegen ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setTokenConfirmRegen(true)}
                    >
                      Regenerate Token
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-400">
                        The display will need to reload to pick up the new token.
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleRegenerateToken}
                        disabled={tokenRegenerating}
                      >
                        {tokenRegenerating ? 'Regenerating...' : 'Confirm'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTokenConfirmRegen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                  {tokenError && <p className="text-xs text-red-400 mt-1">{tokenError}</p>}
                </div>
                <p className="text-xs text-neutral-600 mt-2">
                  For phone bookmarks, append <code className="text-neutral-500">?token=TOKEN</code> to command URLs.
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-neutral-600">
          Forgot your password? Delete <code className="text-neutral-500">data/auth.json</code> on the device to reset.
        </p>
      </div>

      {/* Modal overlay */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h4 className="text-sm font-medium text-neutral-200 mb-4">
              {modal === 'set' && 'Set Password'}
              {modal === 'change' && 'Change Password'}
              {modal === 'disable' && 'Disable Authentication'}
            </h4>

            <div className="space-y-3">
              {(modal === 'change' || modal === 'disable') && (
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setError(null); }}
                  placeholder="Current password"
                  autoFocus
                  className="w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                />
              )}

              {(modal === 'set' || modal === 'change') && (
                <>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    placeholder="New password (min 8 characters)"
                    autoFocus={modal === 'set'}
                    className="w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    placeholder="Confirm new password"
                    className="w-full rounded-md bg-neutral-800 border border-neutral-600 text-sm text-neutral-200 px-3 py-2 focus:outline-none focus:border-blue-500"
                  />
                </>
              )}

              {modal === 'disable' && (
                <p className="text-xs text-neutral-500">
                  This will remove the password and allow anyone on your network to access the editor.
                </p>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
              {success && <p className="text-xs text-green-400">{success}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={resetModal} disabled={submitting}>
                  Cancel
                </Button>
                {modal === 'set' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSetPassword}
                    disabled={!newPassword || !confirmPassword || submitting}
                  >
                    {submitting ? 'Setting...' : 'Set Password'}
                  </Button>
                )}
                {modal === 'change' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={!currentPassword || !newPassword || !confirmPassword || submitting}
                  >
                    {submitting ? 'Changing...' : 'Change Password'}
                  </Button>
                )}
                {modal === 'disable' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDisable}
                    disabled={!currentPassword || submitting}
                  >
                    {submitting ? 'Disabling...' : 'Disable'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
