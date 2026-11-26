'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { AuthStatus, IpAllowlistData } from './types';
import type { RefusedKey } from '@/lib/display-key-refusals';
import PasswordModal from './PasswordModal';
import SessionRevocation from './SessionRevocation';
import DisplayTokenPanel from './DisplayTokenPanel';
import IpAllowlistPanel from './IpAllowlistPanel';
import { logger } from '@/lib/logger';
import { RESET_COMMAND, AUTH_FILE } from '@/lib/password-reset';
import Link from 'next/link';
import { settingsPath } from '@/lib/settings-route';
import FieldHint from '@/components/ui/FieldHint';
import StatusDot from '@/components/ui/StatusDot';

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
  const [lastRefused, setLastRefused] = useState<RefusedKey | null>(null);
  const [ipInitial, setIpInitial] = useState<IpAllowlistData | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const res = await editorFetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          // The display key is made before any password, so Home Assistant
          // can hold it from the start; with one, only a signed-in editor reads it.
          if (!data.authEnabled || data.authenticated) {
            const tokenRes = await editorFetch('/api/auth/display-token');
            if (tokenRes.ok) {
              const { displayToken: token, lastRefused: refused } = await tokenRes.json();
              setDisplayToken(token);
              setLastRefused(refused ?? null);
            }
          }
          if (data.authEnabled && data.authenticated) {
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
        <FieldHint>{t('settings.securityPage.loading')}</FieldHint>
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
              ? 'border-hs-success/30 bg-hs-success/10'
              : 'border-hs-border-strong bg-hs-card/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <StatusDot tone={status?.authEnabled ? 'success' : 'neutral'} />
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
            <FieldHint>
              {t('settings.securityPage.setup.description')}
            </FieldHint>
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
            IPv6 caveat and a warning about relayed traffic hiding the real
            device, which is a lot of network administration to scroll past
            on the way to "change my password". The warnings stay, next to
            the toggles they describe. */}
        {/* With no password only the display key is in here: sign-outs and
            networks mean nothing until there is a password to skip. */}
        {(status?.authEnabled || displayToken) && (
          <details
            className="group rounded-lg border border-hs-border-strong bg-hs-card/40 px-3 py-2.5 transition-colors hover:border-hs-text-faint"
            data-field-id="security.advancedNetwork"
            // Opens by itself when the saved networks turn away the screen on
            // this box, so the notice saying so is not hidden behind a click.
            open={ipInitial?.hubScreenLeftOut || undefined}
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
                  {status?.authEnabled
                    ? t('settings.securityPage.advanced.description')
                    : t('settings.securityPage.advanced.descriptionNoPassword')}
                </span>
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              {status?.authEnabled && <SessionRevocation />}
              {displayToken && (
                <DisplayTokenPanel
                  token={displayToken}
                  onTokenChange={setDisplayToken}
                  passwordOn={!!status?.authEnabled}
                  lastRefused={lastRefused}
                />
              )}
              {status?.authEnabled && <IpAllowlistPanel initial={ipInitial} />}
            </div>
          </details>
        )}

        {/* Same advice /login carries, worded the same way: this page is the
            one you cannot reach once you are locked out. */}
        <FieldHint>
          {t('settings.securityPage.forgotPasswordHint', {
            command: RESET_COMMAND,
            file: AUTH_FILE,
          })}
        </FieldHint>
      </div>

      {/* The other lock people look for here: the one kids meet at the wall. */}
      <FieldHint className="mt-6" data-testid="security-grown-up-pointer">
        {t('settings.securityPage.grownUpPointerPrefix')}
        <Link
          href={settingsPath({ kind: 'defaults', page: 'family' }, { highlight: 'family.grownUpCode' })}
          className="text-hs-accent hover:text-hs-accent-hover underline"
        >
          {t('settings.familyPage.grownUp.heading')}
        </Link>
        {t('settings.securityPage.grownUpPointerSuffix')}
      </FieldHint>

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
