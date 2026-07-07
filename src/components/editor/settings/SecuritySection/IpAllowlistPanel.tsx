'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type { IpAllowlistData } from './types';

type IpStatusKind = 'success' | 'error';
interface IpStatus {
  message: string;
  kind: IpStatusKind;
}

interface IpAllowlistPanelProps {
  /** Snapshot fetched by the parent; null until (or unless) it arrives. */
  initial: IpAllowlistData | null;
}

/** IP allowlist editor: bypass/restrict toggles, entry list, lockout-confirm save. */
export default function IpAllowlistPanel({ initial }: IpAllowlistPanelProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

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

  // Seed local state when the parent's fetch resolves — same timing as the
  // original single-component version, where these setters ran when the
  // /api/auth/ip-allowlist response landed.
  useEffect(() => {
    if (!initial) return;
    setIpAllowlist(initial.allowlist);
    setIpBypassAuth(initial.bypassAuth);
    setIpRestrictAccess(initial.restrictAccess);
    setIpCallerIp(initial.callerIp);
  }, [initial]);

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

  return (
    <div className="mt-6 pt-6 border-t border-hs-border">
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.securityPage.ipAllowlist.heading')}
      </h3>

      <div className="space-y-4">
        {/* Toggles */}
        <div>
          <Toggle
            label={t('settings.securityPage.ipAllowlist.bypassAuth.label')}
            checked={ipBypassAuth}
            onChange={(v) => { setIpBypassAuth(v); setIpDirty(true); }}
            disabled={ipAllowlist.length === 0}
          />
          <p className="text-xs text-hs-text-faint">
            {t('settings.securityPage.ipAllowlist.bypassAuth.help')}
          </p>
        </div>

        <div>
          <Toggle
            label={t('settings.securityPage.ipAllowlist.restrictAccess.label')}
            checked={ipRestrictAccess}
            onChange={(v) => { setIpRestrictAccess(v); setIpDirty(true); }}
            disabled={ipAllowlist.length === 0}
          />
          <p className="text-xs text-hs-text-faint">
            {t('settings.securityPage.ipAllowlist.restrictAccess.help')}
          </p>
        </div>

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
                  ? tCore('status.saving')
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
              ? tCore('status.saving')
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
  );
}
