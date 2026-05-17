'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
  hasDisplayToken: boolean;
}

// Status discriminants — kind drives styling/role explicitly so we never
// sniff English prefixes from translated messages. Each surface (modal,
// token, revoke, ip-allowlist) carries its own kind union; the unions are
// intentionally narrow because not every surface emits every kind.

type ModalStatusKind = 'success' | 'error';
interface ModalStatus {
  message: string;
  kind: ModalStatusKind;
}

type RevokeStatusKind = 'success' | 'error';
interface RevokeStatus {
  message: string;
  kind: RevokeStatusKind;
}

type IpStatusKind = 'success' | 'error';
interface IpStatus {
  message: string;
  kind: IpStatusKind;
}

export default function SecuritySection() {
  const t = useTranslate('editor');

  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<'set' | 'change' | 'disable' | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modalStatus, setModalStatus] = useState<ModalStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Display token state
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRegenerating, setTokenRegenerating] = useState(false);
  const [tokenConfirmRegen, setTokenConfirmRegen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  // Session revocation state
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeStatus, setRevokeStatus] = useState<RevokeStatus | null>(null);

  // IP Allowlist state
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [ipBypassAuth, setIpBypassAuth] = useState(false);
  const [ipRestrictAccess, setIpRestrictAccess] = useState(false);
  const [ipCallerIp, setIpCallerIp] = useState<string>('');
  const [ipNewEntry, setIpNewEntry] = useState('');
  const [ipEntryError, setIpEntryError] = useState<string | null>(null);
  const [ipSaving, setIpSaving] = useState(false);
  const [ipStatus, setIpStatus] = useState<IpStatus | null>(null);
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
    setModalStatus(null);
  }

  async function handleSetPassword() {
    if (newPassword !== confirmPassword) {
      setModalStatus({ message: t('settings.securityPage.errors.passwordsDoNotMatch'), kind: 'error' });
      return;
    }
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.setFailed'),
          kind: 'error',
        });
        return;
      }
      setStatus({ authEnabled: true, authenticated: true, hasDisplayToken: true });
      // Fetch the auto-generated display token so the UI shows it immediately
      const tokenRes = await editorFetch('/api/auth/display-token');
      if (tokenRes.ok) {
        const { displayToken: tok } = await tokenRes.json();
        setDisplayToken(tok);
      }
      setModalStatus({
        message: t('settings.securityPage.success.passwordSet'),
        kind: 'success',
      });
      setTimeout(resetModal, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setModalStatus({ message: t('settings.securityPage.errors.passwordsDoNotMatch'), kind: 'error' });
      return;
    }
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.changeFailed'),
          kind: 'error',
        });
        return;
      }
      setModalStatus({
        message: t('settings.securityPage.success.passwordChanged'),
        kind: 'success',
      });
      setTimeout(resetModal, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    setSubmitting(true);
    setModalStatus(null);
    try {
      const res = await editorFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalStatus({
          message: data.error || t('settings.securityPage.errors.disableFailed'),
          kind: 'error',
        });
        return;
      }
      setStatus({ authEnabled: false, authenticated: false, hasDisplayToken: false });
      // Clear stale token state so re-enabling doesn't show the old token
      setDisplayToken(null);
      setTokenRevealed(false);
      setTokenCopied(false);
      setTokenConfirmRegen(false);
      setTokenStatus(null);
      setModalStatus({
        message: t('settings.securityPage.success.authDisabled'),
        kind: 'success',
      });
      setTimeout(resetModal, 2000);
    } catch {
      setModalStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
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
        if (!ok) {
          setTokenStatus(t('settings.securityPage.displayToken.errorCopy'));
          return;
        }
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
      } catch {
        setTokenStatus(t('settings.securityPage.displayToken.errorCopy'));
      }
    }
  }

  async function handleRegenerateToken() {
    setTokenRegenerating(true);
    setTokenStatus(null);
    try {
      const res = await editorFetch('/api/auth/display-token', { method: 'POST' });
      if (res.ok) {
        const { displayToken: token } = await res.json();
        setDisplayToken(token);
        setTokenConfirmRegen(false);
        setTokenRevealed(true);
      } else {
        setTokenStatus(t('settings.securityPage.displayToken.errorRegenerate'));
      }
    } catch {
      setTokenStatus(t('common.networkError'));
    } finally {
      setTokenRegenerating(false);
    }
  }

  async function handleRevokeAll() {
    setRevoking(true);
    setRevokeStatus(null);
    try {
      const res = await editorFetch('/api/auth/revoke-sessions', { method: 'POST' });
      if (res.ok) {
        setRevokeConfirm(false);
        setRevokeStatus({
          message: t('settings.securityPage.revokeSessions.success'),
          kind: 'success',
        });
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } else {
        setRevokeStatus({
          message: t('settings.securityPage.revokeSessions.failed'),
          kind: 'error',
        });
      }
    } catch {
      setRevokeStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
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
    if (parts.length > 2) {
      setIpEntryError(t('settings.securityPage.ipAllowlist.errors.invalidCidr'));
      return;
    }
    const ipPart = parts[0];
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipPart)) {
      setIpEntryError(t('settings.securityPage.ipAllowlist.errors.invalidIp'));
      return;
    }
    if (parts.length === 2) {
      const prefix = Number(parts[1]);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        setIpEntryError(t('settings.securityPage.ipAllowlist.errors.invalidPrefix'));
        return;
      }
    }
    if (ipAllowlist.includes(entry)) {
      setIpEntryError(t('settings.securityPage.ipAllowlist.errors.alreadyInList'));
      return;
    }

    setIpAllowlist([...ipAllowlist, entry]);
    setIpNewEntry('');
    setIpEntryError(null);
    setIpDirty(true);
  }

  function handleRemoveIpEntry(index: number) {
    setIpAllowlist(ipAllowlist.filter((_, i) => i !== index));
    setIpDirty(true);
  }

  async function handleSaveIpAllowlist(force = false) {
    setIpSaving(true);
    setIpStatus(null);
    if (!force) setIpLockoutConfirm(false);
    try {
      const res = await editorFetch('/api/auth/ip-allowlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowlist: ipAllowlist,
          bypassAuth: ipBypassAuth,
          restrictAccess: ipRestrictAccess,
          force,
        }),
      });
      const data = await res.json();
      // 409 Conflict = server detected lockout risk, ask user to confirm
      if (res.status === 409 && data.reason === 'your_ip_not_in_allowlist') {
        setIpLockoutConfirm(true);
        return;
      }
      if (!res.ok) {
        setIpStatus({
          message: data.error || t('common.saveFailed'),
          kind: 'error',
        });
        return;
      }
      setIpLockoutConfirm(false);
      setIpStatus({
        message: t('common.saved'),
        kind: 'success',
      });
      setIpDirty(false);
      setTimeout(() => setIpStatus(null), 2000);
    } catch {
      setIpStatus({
        message: t('common.networkError'),
        kind: 'error',
      });
    } finally {
      setIpSaving(false);
    }
  }

  if (loading) {
    return (
      <section>
        <p className="text-xs text-hs-text-faint">{t('settings.securityPage.loading')}</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.securityPage.heading')}
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
              ? t('settings.securityPage.status.enabled')
              : t('settings.securityPage.status.disabled')}
          </span>
        </div>

        {!status?.authEnabled && (
          <div className="space-y-3">
            <p className="text-xs text-hs-text-faint">
              {t('settings.securityPage.setup.description')}
            </p>
            <Button variant="primary" size="sm" onClick={() => setModal('set')}>
              {t('settings.securityPage.setup.setPasswordButton')}
            </Button>
          </div>
        )}

        {status?.authEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={() => setModal('change')}>
                {t('settings.securityPage.actions.changePassword')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setModal('disable')}>
                {t('settings.securityPage.actions.disableAuth')}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                {t('settings.securityPage.actions.logOut')}
              </Button>
            </div>

            {/* Session revocation */}
            <div>
              {!revokeConfirm ? (
                <Button variant="secondary" size="sm" onClick={() => setRevokeConfirm(true)}>
                  {t('settings.securityPage.revokeSessions.button')}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-hs-warning">
                    {t('settings.securityPage.revokeSessions.warning')}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRevokeAll}
                    disabled={revoking}
                  >
                    {revoking
                      ? t('settings.securityPage.revokeSessions.revoking')
                      : t('settings.securityPage.revokeSessions.confirmButton')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRevokeConfirm(false)}
                  >
                    {t('settings.securityPage.revokeSessions.cancel')}
                  </Button>
                </div>
              )}
              {revokeStatus && (
                <p
                  className={`text-xs mt-1 ${
                    revoking
                      ? 'text-hs-text-muted'
                      : revokeStatus.kind === 'success'
                        ? 'text-hs-success'
                        : 'text-hs-danger'
                  }`}
                  aria-live="polite"
                  role={revokeStatus.kind === 'error' ? 'alert' : undefined}
                >
                  {revokeStatus.message}
                </p>
              )}
            </div>

            {/* Display Token */}
            {displayToken && (
              <div className="mt-4 pt-4 border-t border-hs-border">
                <h4 className="text-xs font-medium text-hs-text-muted mb-2 uppercase tracking-wider">
                  {t('settings.securityPage.displayToken.heading')}
                </h4>
                <p className="text-xs text-hs-text-faint mb-2">
                  {t('settings.securityPage.displayToken.description')}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono truncate select-all">
                    {tokenRevealed ? displayToken : displayToken.slice(0, 8) + '•'.repeat(16)}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTokenRevealed(!tokenRevealed)}
                  >
                    {tokenRevealed
                      ? t('settings.securityPage.displayToken.hide')
                      : t('settings.securityPage.displayToken.reveal')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleCopyToken}>
                    {tokenCopied
                      ? t('settings.securityPage.displayToken.copied')
                      : t('settings.securityPage.displayToken.copy')}
                  </Button>
                </div>
                <div className="mt-2">
                  {!tokenConfirmRegen ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setTokenConfirmRegen(true)}
                    >
                      {t('settings.securityPage.displayToken.regenerateButton')}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-hs-warning">
                        {t('settings.securityPage.displayToken.regenerateWarning')}
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleRegenerateToken}
                        disabled={tokenRegenerating}
                      >
                        {tokenRegenerating
                          ? t('settings.securityPage.displayToken.regenerating')
                          : t('settings.securityPage.displayToken.regenerateConfirm')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setTokenConfirmRegen(false)}
                      >
                        {t('settings.securityPage.displayToken.regenerateCancel')}
                      </Button>
                    </div>
                  )}
                  {tokenStatus && (
                    <p
                      className="text-xs text-hs-danger mt-1"
                      aria-live="polite"
                      role="alert"
                    >
                      {tokenStatus}
                    </p>
                  )}
                </div>
                <p className="text-xs text-hs-text-faint mt-2">
                  {t('settings.securityPage.displayToken.phoneHintPart1')}
                  <code className="text-hs-text-faint">
                    {t('settings.securityPage.displayToken.phoneHintCode')}
                  </code>
                  {t('settings.securityPage.displayToken.phoneHintPart2')}
                </p>
              </div>
            )}
          </div>
        )}

      {/* IP Allowlist */}
      {status?.authEnabled && (
        <div className="mt-6 pt-6 border-t border-hs-border">
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.securityPage.ipAllowlist.heading')}
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
                <span className="text-sm text-hs-text-body">
                  {t('settings.securityPage.ipAllowlist.bypassAuth.label')}
                </span>
                <p className="text-xs text-hs-text-faint">
                  {t('settings.securityPage.ipAllowlist.bypassAuth.help')}
                </p>
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
                <span className="text-sm text-hs-text-body">
                  {t('settings.securityPage.ipAllowlist.restrictAccess.label')}
                </span>
                <p className="text-xs text-hs-text-faint">
                  {t('settings.securityPage.ipAllowlist.restrictAccess.help')}
                </p>
              </div>
            </label>

            {ipAllowlist.length === 0 && (
              <p className="text-xs text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.emptyHint')}
              </p>
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
                    aria-label={t('settings.securityPage.ipAllowlist.removeAriaLabel', { entry })}
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
                placeholder={t('settings.securityPage.ipAllowlist.addPlaceholder')}
                className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-1.5 font-mono focus:outline-none focus:border-hs-accent"
              />
              <Button variant="secondary" size="sm" onClick={handleAddIpEntry}>
                {t('settings.securityPage.ipAllowlist.addButton')}
              </Button>
            </div>
            {ipEntryError && <p className="text-xs text-hs-danger">{ipEntryError}</p>}

            {/* Caller IP info */}
            {ipCallerIp && (
              <p className="text-xs text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.callerIpLabel')}
                <code className="text-hs-text-secondary font-mono">{ipCallerIp}</code>
              </p>
            )}

            {/* Lockout warning dialog */}
            {ipLockoutConfirm && (
              <div className="rounded-lg bg-hs-warning/10 border border-hs-warning/30 px-4 py-3">
                <p className="text-sm text-hs-warning font-medium">
                  {t('settings.securityPage.ipAllowlist.lockoutWarning.title')}
                </p>
                <p className="text-xs text-hs-text-muted mt-1">
                  {t('settings.securityPage.ipAllowlist.lockoutWarning.messagePart1')}
                  {ipCallerIp}
                  {t('settings.securityPage.ipAllowlist.lockoutWarning.messagePart2')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="danger" size="sm" onClick={() => handleSaveIpAllowlist(true)} disabled={ipSaving}>
                    {ipSaving
                      ? t('common.saving')
                      : t('settings.securityPage.ipAllowlist.lockoutWarning.saveAnyway')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setIpLockoutConfirm(false)}>
                    {t('settings.securityPage.ipAllowlist.lockoutWarning.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {/* Save button */}
            {ipDirty && !ipLockoutConfirm && (
              <Button variant="primary" size="sm" onClick={() => handleSaveIpAllowlist(false)} disabled={ipSaving}>
                {ipSaving
                  ? t('common.saving')
                  : t('settings.securityPage.ipAllowlist.saveButton')}
              </Button>
            )}

            {ipStatus && (
              <p
                className={`text-xs ${ipStatus.kind === 'success' ? 'text-hs-success' : 'text-hs-danger'}`}
                aria-live="polite"
                role={ipStatus.kind === 'error' ? 'alert' : undefined}
              >
                {ipStatus.message}
              </p>
            )}

            <p className="text-xs text-hs-text-faint">
              {t('settings.securityPage.ipAllowlist.lockedOutHintPart1')}
              <code className="text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.lockedOutHintCode')}
              </code>
              {t('settings.securityPage.ipAllowlist.lockedOutHintPart2')}
            </p>
            <p className="text-xs text-hs-text-faint">
              <strong className="text-hs-warning">
                {t('settings.securityPage.ipAllowlist.ipv4Warning.strong')}
              </strong>
              {t('settings.securityPage.ipAllowlist.ipv4Warning.part1')}
              <code className="text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.ipv4Warning.loopback')}
              </code>
              {t('settings.securityPage.ipAllowlist.ipv4Warning.or')}
              <code className="text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.ipv4Warning.linkLocal')}
              </code>
              {t('settings.securityPage.ipAllowlist.ipv4Warning.part2')}
            </p>
            <p className="text-xs text-hs-text-faint">
              <strong className="text-hs-warning">
                {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.strong')}
              </strong>
              {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.part1')}
              <code className="text-hs-text-faint">
                {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.header')}
              </code>
              {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.part2')}
            </p>
          </div>
        </div>
      )}

        <p className="text-xs text-hs-text-faint">
          {t('settings.securityPage.forgotPasswordPart1')}
          <code className="text-hs-text-faint">
            {t('settings.securityPage.forgotPasswordCode')}
          </code>
          {t('settings.securityPage.forgotPasswordPart2')}
        </p>
      </div>

      {/* Modal overlay */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-hs-panel border border-hs-border-strong rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h4 className="text-sm font-medium text-hs-text-body mb-4">
              {modal === 'set' && t('settings.securityPage.modal.setTitle')}
              {modal === 'change' && t('settings.securityPage.modal.changeTitle')}
              {modal === 'disable' && t('settings.securityPage.modal.disableTitle')}
            </h4>

            <div className="space-y-3">
              {(modal === 'change' || modal === 'disable') && (
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setModalStatus(null); }}
                  placeholder={t('settings.securityPage.modal.currentPasswordPlaceholder')}
                  autoFocus
                  className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                />
              )}

              {(modal === 'set' || modal === 'change') && (
                <>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setModalStatus(null); }}
                    placeholder={t('settings.securityPage.modal.newPasswordPlaceholder')}
                    autoFocus={modal === 'set'}
                    className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setModalStatus(null); }}
                    placeholder={t('settings.securityPage.modal.confirmPasswordPlaceholder')}
                    className="w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
                  />
                </>
              )}

              {modal === 'disable' && (
                <p className="text-xs text-hs-text-faint">
                  {t('settings.securityPage.modal.disableWarning')}
                </p>
              )}

              {modalStatus && (
                <p
                  className={`text-xs ${modalStatus.kind === 'success' ? 'text-hs-success' : 'text-hs-danger'}`}
                  aria-live="polite"
                  role={modalStatus.kind === 'error' ? 'alert' : undefined}
                >
                  {modalStatus.message}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={resetModal} disabled={submitting}>
                  {t('settings.securityPage.modal.cancel')}
                </Button>
                {modal === 'set' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSetPassword}
                    disabled={!newPassword || !confirmPassword || submitting}
                  >
                    {submitting
                      ? t('settings.securityPage.modal.setting')
                      : t('settings.securityPage.modal.setSubmit')}
                  </Button>
                )}
                {modal === 'change' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={!currentPassword || !newPassword || !confirmPassword || submitting}
                  >
                    {submitting
                      ? t('settings.securityPage.modal.changing')
                      : t('settings.securityPage.modal.changeSubmit')}
                  </Button>
                )}
                {modal === 'disable' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDisable}
                    disabled={!currentPassword || submitting}
                  >
                    {submitting
                      ? t('settings.securityPage.modal.disabling')
                      : t('settings.securityPage.modal.disableSubmit')}
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
