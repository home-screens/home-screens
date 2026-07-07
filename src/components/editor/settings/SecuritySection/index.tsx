'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { AuthStatus, IpAllowlistData } from './types';
import PasswordModal from './PasswordModal';
import SessionRevocation from './SessionRevocation';
import DisplayTokenPanel from './DisplayTokenPanel';
import IpAllowlistPanel from './IpAllowlistPanel';
import { logger } from '@/lib/logger';

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

            <SessionRevocation />

            {displayToken && (
              <DisplayTokenPanel token={displayToken} onTokenChange={setDisplayToken} />
            )}
          </div>
        )}

        {status?.authEnabled && <IpAllowlistPanel initial={ipInitial} />}

        <p className="text-xs text-hs-text-faint">
          {t('settings.securityPage.forgotPasswordPart1')}
          <code className="text-hs-text-faint">
            {t('settings.securityPage.forgotPasswordCode')}
          </code>
          {t('settings.securityPage.forgotPasswordPart2')}
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
