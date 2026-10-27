'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import SudoPasswordPrompt from '@/components/editor/SudoPasswordPrompt';
import ManagementWarningModal from './ManagementWarningModal';
import { managementWarningText } from './management-warning';
import { useTranslate, useFormattingLocale, type TranslateFn } from '@/i18n';
import type { SavedNetwork } from '@/lib/network-types';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';

/* ─── Helpers ──────────────────────────────── */

/** The day a network was last joined, on the household's calendar rather than the laptop's. */
export function formatLastUsed(
  iso: string,
  t: TranslateFn,
  formattingLocale: string,
  timezone: string | undefined,
): string {
  if (iso === 'never') return t('settings.networkPage.savedNetworks.neverUsed');
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const formatted = formatDateInTZ(d, timezone, { month: 'short', day: 'numeric', year: 'numeric' }, formattingLocale);
  return t('settings.networkPage.savedNetworks.lastUsed', { date: formatted });
}

/* ─── Props ────────────────────────────────── */

interface SavedNetworksSectionProps {
  /** Re-fetch trigger — increment to force refresh */
  refreshKey: number;
}

/* ─── Component ────────────────────────────── */

export default function SavedNetworksSection({ refreshKey }: SavedNetworksSectionProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
  const [networks, setNetworks] = useState<SavedNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [confirmForgetId, setConfirmForgetId] = useState<string | null>(null);
  // Connection id whose forget stalled on the device password; retried after the grant
  const [sudoRetryId, setSudoRetryId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  // The last Forget that failed, shown under the list instead of leaving the row stuck
  const [forgetError, setForgetError] = useState<string | null>(null);
  // Forgetting the network this page arrives over asks first, like Disconnect does
  const [managementWarning, setManagementWarning] = useState<{
    warning: string;
    onProceed: () => void;
  } | null>(null);

  /* ── Fetch saved networks ──────────────────── */

  const fetchSaved = useCallback(
    async (withPasswords = false) => {
      try {
        const qs = withPasswords ? '?showPasswords=true' : '';
        const res = await editorFetch(`/api/system/network/wifi/saved${qs}`);
        if (res.ok) {
          const data: SavedNetwork[] = await res.json();
          setNetworks(data);
          setError(null);
        } else {
          setError(t('settings.networkPage.savedNetworks.loadError'));
        }
      } catch {
        setError(t('common.serverUnreachable'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    fetchSaved(showPasswords);
  }, [fetchSaved, refreshKey, showPasswords]);

  /* ── Forget a network ──────────────────────── */

  const handleForget = useCallback(
    async (connectionId: string, confirmed = false) => {
      setForgettingId(connectionId);
      setForgetError(null);
      try {
        const body: Record<string, unknown> = { connectionId };
        if (confirmed) body.confirmed = true;
        // Bounded: forgetting the network this page arrives over drops the
        // reply, and without a deadline the row sat on "Removing..." until
        // the browser gave up on the socket minutes later
        const res = await editorFetch('/api/system/network/wifi/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        const data = await res.json().catch(() => ({}));
        if (data.requiresConfirmation) {
          setManagementWarning({
            warning: managementWarningText(t, data, window.location.port),
            onProceed: () => {
              setManagementWarning(null);
              handleForget(connectionId, true);
            },
          });
          return;
        }
        if (res.ok && data.ok) {
          setNetworks((prev) => prev.filter((n) => n.id !== connectionId));
        } else if (data.needsSudoPassword) {
          setSudoRetryId(connectionId);
        } else {
          setForgetError(data.error ?? t('settings.networkPage.savedNetworks.forgetError'));
        }
      } catch {
        // The response never came back, which is what happens when the
        // forgotten network was the one carrying this page
        setForgetError(t('settings.networkPage.savedNetworks.forgetError'));
      } finally {
        setForgettingId(null);
        setConfirmForgetId(null);
      }
    },
    [t],
  );

  if (loading) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint">
          {t('settings.networkPage.savedNetworks.loading')}
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-danger">{error}</p>
      </section>
    );
  }

  if (networks.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint">
          {t('settings.networkPage.savedNetworks.empty')}
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
          {t('settings.networkPage.savedNetworks.heading')}
        </h3>
        <button
          type="button"
          onClick={() => setShowPasswords(!showPasswords)}
          className="text-xs text-hs-text-muted hover:text-hs-text-body transition-colors"
        >
          {showPasswords
            ? t('settings.networkPage.savedNetworks.hidePasswords')
            : t('settings.networkPage.savedNetworks.showPasswords')}
        </button>
      </div>
      {sudoRetryId && (
        <div className="mb-3">
          <SudoPasswordPrompt
            compact
            onGranted={() => {
              const id = sudoRetryId;
              setSudoRetryId(null);
              handleForget(id);
            }}
            onCancel={() => setSudoRetryId(null)}
          />
        </div>
      )}
      <div className="space-y-1">
        {networks.map((network) => (
          <div
            key={network.id}
            className="flex items-center gap-3 rounded-md px-3 py-2 bg-hs-input border border-hs-border"
          >
            {/* Network info */}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-hs-text-primary truncate block">
                {network.ssid}
              </span>
              <div className="flex items-center gap-2 text-xs text-hs-text-muted">
                {network.iface && (
                  <>
                    <span>{t('settings.networkPage.savedNetworks.onAdapter', { device: network.iface })}</span>
                    <span className="text-hs-text-faint">&middot;</span>
                  </>
                )}
                <span>{formatLastUsed(network.lastUsed, t, formattingLocale, timezone)}</span>
                {network.autoconnect && (
                  <>
                    <span className="text-hs-text-faint">&middot;</span>
                    <span>{t('settings.networkPage.savedNetworks.autoConnect')}</span>
                  </>
                )}
              </div>
              {showPasswords && network.password && (
                <div className="mt-1 text-xs font-mono text-hs-text-muted bg-hs-bg px-2 py-0.5 rounded inline-block">
                  {network.password}
                </div>
              )}
            </div>

            {/* Forget button / confirmation */}
            {confirmForgetId === network.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-hs-text-muted">
                  {t('settings.networkPage.savedNetworks.forgetPrompt')}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={forgettingId === network.id}
                  onClick={() => handleForget(network.id)}
                >
                  {forgettingId === network.id
                    ? t('settings.networkPage.savedNetworks.forgettingButton')
                    : t('settings.networkPage.savedNetworks.forgetConfirmYes')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmForgetId(null)}
                >
                  {t('settings.networkPage.savedNetworks.forgetConfirmNo')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmForgetId(network.id)}
                className="shrink-0"
              >
                {t('settings.networkPage.savedNetworks.forgetButton')}
              </Button>
            )}
          </div>
        ))}
      </div>
      {forgetError && (
        <p className="mt-2 text-xs text-hs-danger">{forgetError}</p>
      )}
      {managementWarning && (
        <ManagementWarningModal
          warning={managementWarning.warning}
          autoRevert={false}
          onProceed={managementWarning.onProceed}
          onCancel={() => setManagementWarning(null)}
        />
      )}
    </section>
  );
}
