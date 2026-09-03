'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { AuthStatus, IpAllowlistData } from './types';
import PasswordModal from './PasswordModal';
import SessionRevocation from './SessionRevocation';
import DisplayTokenPanel from './DisplayTokenPanel';
import IpAllowlistPanel from './IpAllowlistPanel';
import { logger } from '@/lib/logger';
import { RESET_COMMAND, AUTH_FILE } from '@/lib/password-reset';

const log = logger('security');

/**
 * Security settings page, one subcomponent per feature: password auth
 * (PasswordModal), display token (DisplayTokenPanel), session revocation
 * (SessionRevocation), and the IP allowlist (IpAllowlistPanel). This parent
 * owns the auth status + display token because password set/disable mutates
 * both; the modal open-state lives here so the overlay renders outside the
 * space-y wrapper (whose sibling margin would offset a fixed overlay).
 */
export default function SecuritySection() {
  const t = useTranslate('editor');

  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'set' | 'change' | 'disable' | null>(null);
  const [displayToken, setDisplayToken] = useState<string | null>(null);
  const [ipInitial, setIpInitial] = useState<IpAllowlistData | null>(null);

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
                setIpInitial(await ipRes.json());
              }
            } catch (err) {
              log.debug('Failed to fetch IP allowlist:', err);
            }
          }
        }
      } catch (err) {
        log.debug('Failed to check auth status:', err);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  async function handleLogout() {
    try {
      await editorFetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      log.debug('Logout request failed:', err);
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
      <div className="space-y-3">
        {/* Lead with the outcome. The page used to open on the word
            "Authentication" followed by "protect the editor and API
            endpoints", which answers a question nobody in the house asked;
            the one they do ask is whether the kids' chores page still opens
            once a password is on. */}
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            status?.authEnabled
              ? 'border-hs-success/35 bg-hs-success/[0.07]'
              : 'border-hs-border-strong bg-hs-card/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                status?.authEnabled ? 'bg-hs-success' : 'bg-hs-card'
              }`}
            />
            <span className={`text-sm font-medium ${status?.authEnabled ? 'text-hs-success' : 'text-hs-text-secondary'}`}>
              {status?.authEnabled
                ? t('settings.securityPage.status.enabled')
                : t('settings.securityPage.status.disabled')}
            </span>
          </div>
          <p className="mt-1 text-xs text-hs-text-muted">
            {status?.authEnabled
              ? t('settings.securityPage.status.enabledOutcome')
              : t('settings.securityPage.status.disabledOutcome')}
          </p>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setModal('change')}
                data-field-id="security.changePassword"
              >
                {t('settings.securityPage.actions.changePassword')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setModal('disable')}>
                {t('settings.securityPage.actions.disableAuth')}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                {t('settings.securityPage.actions.logOut')}
              </Button>
            </div>

          </div>
        )}

        {/* The display token, the signed-in devices and the IP allowlist are
            one subject: which machines get in without typing the password.
            They were three always-open panels carrying CIDR errors, an
            IPv6 caveat and an X-Forwarded-For spoofing warning, which is a
            lot of network administration to scroll past on the way to
            "change my password". The warnings stay, next to the toggles they
            describe. */}
        {status?.authEnabled && (
          <details
            className="group rounded-lg border border-hs-border-strong bg-hs-card/40 px-3 py-2.5 transition-colors hover:border-hs-text-faint"
            data-field-id="security.advancedNetwork"
          >
            {/* `list-none` drops the native disclosure marker, so the chevron
                is what says this opens. Without one the block reads as a
                static explanation you cannot act on. */}
            <summary className="flex cursor-pointer list-none items-start gap-2 text-sm text-hs-text-secondary">
              <ChevronDown
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hs-text-faint transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="font-medium">{t('settings.securityPage.advanced.heading')}</span>
                <span className="mt-0.5 block text-xs text-hs-text-faint">
                  {t('settings.securityPage.advanced.description')}
                </span>
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <SessionRevocation />
              {displayToken && (
                <DisplayTokenPanel token={displayToken} onTokenChange={setDisplayToken} />
              )}
              <IpAllowlistPanel initial={ipInitial} />
            </div>
          </details>
        )}

        {/* Same advice /login carries, worded the same way: this page is the
            one you cannot reach once you are locked out. */}
        <p className="text-xs text-hs-text-faint">
          {t('settings.securityPage.forgotPasswordHint', {
            command: RESET_COMMAND,
            file: AUTH_FILE,
          })}
        </p>
      </div>

      {modal && (
        <PasswordModal
          mode={modal}
          onClose={() => setModal(null)}
          onStatusChange={setStatus}
          onDisplayTokenChange={setDisplayToken}
        />
      )}
    </section>
  );
}
