'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type { IpAllowlistData } from './types';
import { cidrFault, type CidrFault } from '@/lib/cidr';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import { SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import Notice from '@/components/ui/Notice';
import IconButton from '@/components/ui/IconButton';
import { refusalSentence } from '@/lib/hub-request';

const ENTRY_FAULT_KEY: Record<CidrFault, string> = {
  format: 'invalidCidr',
  address: 'invalidIp',
  prefix: 'invalidPrefix',
};

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
  // The screen plugged into the hub opens the wall from 127.0.0.1. `asking`
  // is the save that hit it (and whether that save had already been told to
  // go ahead without this browser); `leftOut` is a list saved before the
  // question existed, which is blanking that screen now.
  const [hubScreen, setHubScreen] = useState<{ asking: { force: boolean } | null; leftOut: boolean; address: string }>(
    { asking: null, leftOut: false, address: '' },
  );

  // Seed local state when the parent's fetch resolves — same timing as the
  // original single-component version, where these setters ran when the
  // /api/auth/ip-allowlist response landed.
  useEffect(() => {
    if (!initial) return;
    setIpAllowlist(initial.allowlist);
    setIpBypassAuth(initial.bypassAuth);
    setIpRestrictAccess(initial.restrictAccess);
    setIpCallerIp(initial.callerIp);
    setHubScreen((h) => ({ ...h, leftOut: initial.hubScreenLeftOut === true, address: initial.hubScreenAddress }));
  }, [initial]);

  function handleAddIpEntry() {
    const entry = ipNewEntry.trim();
    if (!entry) return;

    // The hub's own rule, so nothing lands in the list that Save would refuse.
    const fault = cidrFault(entry);
    if (fault) {
      setIpEntryError(t(`settings.securityPage.ipAllowlist.errors.${ENTRY_FAULT_KEY[fault]}`));
      return;
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

  async function handleSaveIpAllowlist(
    force = false,
    { forceHubScreen = false, allowlist = ipAllowlist }: { forceHubScreen?: boolean; allowlist?: string[] } = {},
  ) {
    setIpSaving(true);
    setIpStatus(null);
    if (!force) setIpLockoutConfirm(false);
    setHubScreen((h) => ({ ...h, asking: null }));
    try {
      const res = await editorFetch('/api/auth/ip-allowlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowlist,
          bypassAuth: ipBypassAuth,
          restrictAccess: ipRestrictAccess,
          force,
          forceHubScreen,
        }),
      });
      const data = await res.json();
      // 409 Conflict = server detected lockout risk, ask user to confirm
      if (res.status === 409 && data.reason === 'your_ip_not_in_allowlist') {
        setIpLockoutConfirm(true);
        return;
      }
      if (res.status === 409 && data.reason === 'hub_screen_not_in_allowlist') {
        setIpLockoutConfirm(false);
        setHubScreen((h) => ({ ...h, asking: { force }, address: data.hubScreenAddress ?? h.address }));
        return;
      }
      if (!res.ok) {
        setIpStatus({
          message: refusalSentence(data, tCore) ?? tCore('refusals.saveFailed'),
          kind: 'error',
        });
        return;
      }
      setIpLockoutConfirm(false);
      // Asked and answered, either way: no notice until the next visit.
      setHubScreen((h) => ({ ...h, leftOut: false }));
      setIpStatus({
        message: t('common.saved'),
        kind: 'success',
      });
      setIpDirty(false);
      setTimeout(() => setIpStatus(null), 2000);
    } catch {
      setIpStatus({
        message: tCore('refusals.hubUnreachable'),
        kind: 'error',
      });
    } finally {
      setIpSaving(false);
    }
  }

  /** Put the hub's own screen on the list and save, keeping whatever the save already agreed to. */
  function addHubScreenAndSave(force: boolean) {
    const allowlist = ipAllowlist.includes(hubScreen.address) ? ipAllowlist : [...ipAllowlist, hubScreen.address];
    setIpAllowlist(allowlist);
    void handleSaveIpAllowlist(force, { allowlist });
  }

  return (
    <div className="mt-6 pt-6 border-t border-hs-border">
      <SettingsSectionHeading>
        {t('settings.securityPage.ipAllowlist.heading')}
      </SettingsSectionHeading>

      <div className="space-y-4">
        {/* Saved before the save asked about it: the wall on this box shows
            "Access restricted" right now. */}
        {hubScreen.leftOut && !hubScreen.asking && (
          <Notice tone="warning" title={t('settings.securityPage.ipAllowlist.hubScreen.leftOutTitle')} testId="hub-screen-left-out">
            <p className="text-hs-text-muted mt-1">
              {t('settings.securityPage.ipAllowlist.hubScreen.leftOutBody', { address: hubScreen.address })}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="primary" size="sm" onClick={() => addHubScreenAndSave(false)} disabled={ipSaving}>
                {ipSaving ? tCore('status.saving') : t('settings.securityPage.ipAllowlist.hubScreen.addAndSave')}
              </Button>
            </div>
          </Notice>
        )}

        {/* Toggles */}
        <div data-field-id="security.ipAllowlistBypassAuth">
          <Toggle
            label={t('settings.securityPage.ipAllowlist.bypassAuth.label')}
            checked={ipBypassAuth}
            onChange={(v) => { setIpBypassAuth(v); setIpDirty(true); }}
            disabled={ipAllowlist.length === 0}
            description={t('settings.securityPage.ipAllowlist.bypassAuth.help')}
          />
        </div>

        <div data-field-id="security.ipAllowlistRestrictAccess">
          <Toggle
            label={t('settings.securityPage.ipAllowlist.restrictAccess.label')}
            checked={ipRestrictAccess}
            onChange={(v) => { setIpRestrictAccess(v); setIpDirty(true); }}
            disabled={ipAllowlist.length === 0}
            description={t('settings.securityPage.ipAllowlist.restrictAccess.help')}
          />
        </div>

        {ipAllowlist.length === 0 && (
          <FieldHint>
            {t('settings.securityPage.ipAllowlist.emptyHint')}
          </FieldHint>
        )}

        {/* Entry list */}
        <div className="space-y-1.5">
          {ipAllowlist.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-hs-card border border-hs-border-strong rounded px-2 py-1.5 text-hs-text-secondary font-mono">
                {entry}
              </code>
              <IconButton
                onClick={() => handleRemoveIpEntry(i)}
                label={t('settings.securityPage.ipAllowlist.removeAriaLabel', { entry })}
              />
            </div>
          ))}
        </div>

        {/* Add entry */}
        <div className="flex items-center gap-2" data-field-id="security.ipAllowlistAddEntry">
          <input
            type="text"
            value={ipNewEntry}
            onChange={(e) => { setIpNewEntry(e.target.value); setIpEntryError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIpEntry(); } }}
            placeholder={t('settings.securityPage.ipAllowlist.addPlaceholder')}
            className={`flex-1 font-mono ${SETTINGS_INPUT_SM_CLASS}`}
          />
          <Button variant="secondary" size="sm" onClick={handleAddIpEntry}>
            {t('settings.securityPage.ipAllowlist.addButton')}
          </Button>
        </div>
        {ipEntryError && <p className="text-xs text-hs-danger">{ipEntryError}</p>}

        {/* Caller IP info */}
        {ipCallerIp && (
          <FieldHint>
            {t('settings.securityPage.ipAllowlist.callerIpLabel')}
            <code className="text-hs-text-secondary font-mono">{ipCallerIp}</code>
          </FieldHint>
        )}

        {/* Lockout warning dialog */}
        {ipLockoutConfirm && (
          <Notice tone="warning" title={t('settings.securityPage.ipAllowlist.lockoutWarning.title')}>
            <p className="text-hs-text-muted mt-1">
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
          </Notice>
        )}

        {/* The screen plugged into the hub would be turned away. */}
        {hubScreen.asking && (
          <Notice tone="warning" title={t('settings.securityPage.ipAllowlist.hubScreen.title')} testId="hub-screen-confirm">
            <p className="text-hs-text-muted mt-1">
              {t('settings.securityPage.ipAllowlist.hubScreen.body', { address: hubScreen.address })}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Button variant="primary" size="sm" onClick={() => addHubScreenAndSave(hubScreen.asking!.force)} disabled={ipSaving}>
                {ipSaving ? tCore('status.saving') : t('settings.securityPage.ipAllowlist.hubScreen.addAndSave')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleSaveIpAllowlist(hubScreen.asking!.force, { forceHubScreen: true })}
                disabled={ipSaving}
              >
                {t('settings.securityPage.ipAllowlist.hubScreen.saveWithout')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setHubScreen((h) => ({ ...h, asking: null }))}>
                {t('settings.securityPage.ipAllowlist.lockoutWarning.cancel')}
              </Button>
            </div>
          </Notice>
        )}

        {/* Save button */}
        {ipDirty && !ipLockoutConfirm && !hubScreen.asking && (
          <Button variant="primary" size="sm" onClick={() => handleSaveIpAllowlist(false)} disabled={ipSaving}>
            {ipSaving
              ? tCore('status.saving')
              : tCore('actions.save')}
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

        <FieldHint>
          {t('settings.securityPage.ipAllowlist.lockedOutHintPart1')}
          <code className="text-hs-text-faint">
            {t('settings.securityPage.ipAllowlist.lockedOutHintCode')}
          </code>
          {t('settings.securityPage.ipAllowlist.lockedOutHintPart2')}
        </FieldHint>
        <FieldHint>
          <strong className="text-hs-warning-ink">
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
        </FieldHint>
        <FieldHint>
          <strong className="text-hs-warning-ink">
            {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.strong')}
          </strong>
          {t('settings.securityPage.ipAllowlist.trustedNetworksWarning.part1')}
        </FieldHint>
      </div>
    </div>
  );
}
