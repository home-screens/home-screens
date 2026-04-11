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

  // Session revocation state
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);

  // IP Allowlist state
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [ipBypassAuth, setIpBypassAuth] = useState(false);
  const [ipRestrictAccess, setIpRestrictAccess] = useState(false);
  const [ipCallerIp, setIpCallerIp] = useState<string>('');
  const [ipNewEntry, setIpNewEntry] = useState('');
  const [ipEntryError, setIpEntryError] = useState<string | null>(null);
  const [ipSaving, setIpSaving] = useState(false);
  const [ipMessage, setIpMessage] = useState<string | null>(null);
  const [ipDirty, setIpDirty] = useState(false);
  const [ipLockoutConfirm, setIpLockoutConfirm] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await editorFetch('/api/auth/status');
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
            // Fetch IP allowlist state if authenticated
            try {
              const ipRes = await editorFetch('/api/auth/ip-allowlist');
              if (ipRes.ok) {
                const ipData = await ipRes.json();
                setIpAllowlist(ipData.allowlist);
                setIpBypassAuth(ipData.bypassAuth);
                setIpRestrictAccess(ipData.restrictAccess);
                setIpCallerIp(ipData.callerIp);
              }
            } catch (err) {
              console.debug('Failed to fetch IP allowlist:', err);
            }
          }
        }
      } catch (err) {
        console.debug('Failed to check auth status:', err);
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

  async function handleRevokeAll() {
    setRevoking(true);
    setRevokeMessage(null);
    try {
      const res = await editorFetch('/api/auth/revoke-sessions', { method: 'POST' });
      if (res.ok) {
        setRevokeConfirm(false);
        setRevokeMessage('All sessions revoked. Redirecting to login...');
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } else {
        setRevokeMessage('Failed to revoke sessions');
      }
    } catch {
      setRevokeMessage('Network error');
    } finally {
      setRevoking(false);
    }
  }

  async function handleLogout() {
    try {
      await editorFetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.debug('Logout request failed:', err);
    }
  }

  function handleAddIpEntry() {
    const entry = ipNewEntry.trim();
    if (!entry) return;

    // Client-side validation: basic format check (full validation on server)
    const parts = entry.split('/');
    if (parts.length > 2) { setIpEntryError('Invalid CIDR format'); return; }
    const ipPart = parts[0];
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipPart)) { setIpEntryError('Invalid IP address'); return; }
    if (parts.length === 2) {
      const prefix = Number(parts[1]);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) { setIpEntryError('Prefix length must be 0-32'); return; }
    }
    if (ipAllowlist.includes(entry)) { setIpEntryError('Already in the list'); return; }

    setIpAllowlist([...ipAllowlist, entry]);
    setIpNewEntry('');
    setIpEntryError(null);
    setIpDirty(true);
  }

  function handleRemoveIpEntry(index: number) {
    setIpAllowlist(ipAllowlist.filter((_, i) => i !== index));
    setIpDirty(true);
  }

  async function handleSaveIpAllowlist() {
    setIpSaving(true);
    setIpMessage(null);
    setIpLockoutConfirm(false);
    try {
      const res = await editorFetch('/api/auth/ip-allowlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowlist: ipAllowlist,
          bypassAuth: ipBypassAuth,
          restrictAccess: ipRestrictAccess,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIpMessage(data.error || 'Failed to save');
        return;
      }
      if (data.warning === 'your_ip_not_in_allowlist') {
        setIpLockoutConfirm(true);
        return;
      }
      setIpMessage('Saved');
      setIpDirty(false);
      setTimeout(() => setIpMessage(null), 2000);
    } catch {
      setIpMessage('Network error');
    } finally {
      setIpSaving(false);
    }
  }

  if (loading) {
    return (
      <section>
        <p className="text-xs text-hs-text-faint">Checking authentication status...</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        Authentication
      </h3>
      <div className="space-y-3">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status?.authEnabled ? 'bg-hs-success' : 'bg-hs-card'
            }`}
          />
          <span className="text-sm text-hs-text-secondary">
            {status?.authEnabled
              ? 'Authentication is enabled'
              : 'Authentication is disabled'}
          </span>
        </div>

        {!status?.authEnabled && (
          <div className="space-y-3">
            <p className="text-xs text-hs-text-faint">
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
            <div className="flex items-center gap-2 flex-wrap">
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

            {/* Session revocation */}
            <div>
              {!revokeConfirm ? (
                <Button variant="secondary" size="sm" onClick={() => setRevokeConfirm(true)}>
                  Revoke All Sessions
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-hs-warning">
                    All sessions will be invalidated, including this one.
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRevokeAll}
                    disabled={revoking}
                  >
                    {revoking ? 'Revoking...' : 'Confirm'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRevokeConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {revokeMessage && (
                <p className={`text-xs mt-1 ${revoking ? 'text-hs-text-muted' : revokeMessage.startsWith('All sessions') ? 'text-hs-success' : 'text-hs-danger'}`}>
                  {revokeMessage}
                </p>
              )}
            </div>

            {/* Display Token */}
            {displayToken && (
              <div className="mt-4 pt-4 border-t border-hs-border">
                <h4 className="text-xs font-medium text-hs-text-muted mb-2 uppercase tracking-wider">
                  Display Token
                </h4>
                <p className="text-xs text-hs-text-faint mb-2">
                  The display uses this token to authenticate API requests. It was auto-generated when you set a password.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono truncate select-all">
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
                      <span className="text-xs text-hs-warning">
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
                  {tokenError && <p className="text-xs text-hs-danger mt-1">{tokenError}</p>}
                </div>
                <p className="text-xs text-hs-text-faint mt-2">
                  For phone bookmarks, append <code className="text-hs-text-faint">?token=TOKEN</code> to command URLs.
                </p>
              </div>
            )}
          </div>
        )}

      {/* IP Allowlist */}
      {status?.authEnabled && (
        <div className="mt-6 pt-6 border-t border-hs-border">
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            IP Allowlist
          </h3>

          <div className="space-y-4">
            {/* Toggles */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ipBypassAuth}
                onChange={(e) => { setIpBypassAuth(e.target.checked); setIpDirty(true); }}
                disabled={ipAllowlist.length === 0}
                className="mt-0.5 accent-hs-accent rounded"
              />
              <div>
                <span className="text-sm text-hs-text-body">Skip authentication for trusted IPs</span>
                <p className="text-xs text-hs-text-faint">Displays on these networks won&apos;t need a token</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ipRestrictAccess}
                onChange={(e) => { setIpRestrictAccess(e.target.checked); setIpDirty(true); }}
                disabled={ipAllowlist.length === 0}
                className="mt-0.5 accent-hs-accent rounded"
              />
              <div>
                <span className="text-sm text-hs-text-body">Restrict access to trusted IPs</span>
                <p className="text-xs text-hs-text-faint">Block all other IPs from reaching the system (except the login page)</p>
              </div>
            </label>

            {ipAllowlist.length === 0 && (ipBypassAuth || ipRestrictAccess) === false && (
              <p className="text-xs text-hs-text-faint">Add at least one IP range to enable these options.</p>
            )}

            {/* Entry list */}
            <div className="space-y-1.5">
              {ipAllowlist.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono">
                    {entry}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleRemoveIpEntry(i)}
                    className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors px-1"
                    aria-label={`Remove ${entry}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Add entry */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ipNewEntry}
                onChange={(e) => { setIpNewEntry(e.target.value); setIpEntryError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIpEntry(); } }}
                placeholder="192.168.1.0/24"
                className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-1.5 font-mono focus:outline-none focus:border-hs-accent"
              />
              <Button variant="secondary" size="sm" onClick={handleAddIpEntry}>
                Add
              </Button>
            </div>
            {ipEntryError && <p className="text-xs text-hs-danger">{ipEntryError}</p>}

            {/* Caller IP info */}
            {ipCallerIp && (
              <p className="text-xs text-hs-text-faint">
                Your IP: <code className="text-hs-text-secondary font-mono">{ipCallerIp}</code>
              </p>
            )}

            {/* Lockout warning dialog */}
            {ipLockoutConfirm && (
              <div className="rounded-lg bg-hs-warning/10 border border-hs-warning/30 px-4 py-3">
                <p className="text-sm text-hs-warning font-medium">You may lock yourself out</p>
                <p className="text-xs text-hs-text-muted mt-1">
                  Your current IP ({ipCallerIp}) is not in the allowlist. If access restriction is enabled, you&apos;ll lose access to this editor.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="danger" size="sm" onClick={async () => {
                    setIpLockoutConfirm(false);
                    setIpSaving(true);
                    try {
                      const res = await editorFetch('/api/auth/ip-allowlist', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ allowlist: ipAllowlist, bypassAuth: ipBypassAuth, restrictAccess: ipRestrictAccess }),
                      });
                      if (res.ok) { setIpMessage('Saved'); setIpDirty(false); setTimeout(() => setIpMessage(null), 2000); }
                    } catch { setIpMessage('Network error'); }
                    finally { setIpSaving(false); }
                  }}>
                    Save Anyway
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setIpLockoutConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Save button */}
            {ipDirty && !ipLockoutConfirm && (
              <Button variant="primary" size="sm" onClick={handleSaveIpAllowlist} disabled={ipSaving}>
                {ipSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}

            {ipMessage && (
              <p className={`text-xs ${ipMessage === 'Saved' ? 'text-hs-success' : 'text-hs-danger'}`}>
                {ipMessage}
              </p>
            )}

            <p className="text-xs text-hs-text-faint">
              If locked out, edit <code className="text-hs-text-faint">data/auth.json</code> on the device to disable.
            </p>
          </div>
        </div>
      )}

        <p className="text-xs text-hs-text-faint">
          Forgot your password? Delete <code className="text-hs-text-faint">data/auth.json</code> on the device to reset.
        </p>
      </div>

      {/* Modal overlay */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-hs-panel border border-hs-border-strong rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h4 className="text-sm font-medium text-hs-text-body mb-4">
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
                  className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
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
                    className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    placeholder="Confirm new password"
                    className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                  />
                </>
              )}

              {modal === 'disable' && (
                <p className="text-xs text-hs-text-faint">
                  This will remove the password and allow anyone on your network to access the editor.
                </p>
              )}

              {error && <p className="text-xs text-hs-danger">{error}</p>}
              {success && <p className="text-xs text-hs-success">{success}</p>}

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
