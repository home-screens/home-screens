'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { IPv4Info } from '@/lib/network-types';

/* ─── Props ────────────────────────────────── */

interface IPSettingsPanelProps {
  device: string;
  connectionName: string;
  connectionUuid: string;
  currentIPv4?: IPv4Info;
  isManagementInterface: boolean;
  onConfirmationRequired: (warning: string, onConfirm: () => void) => void;
  onRollbackStarted: (rollbackId: string) => void;
  onApplied: () => void;
}

/* ─── Component ────────────────────────────── */

export default function IPSettingsPanel({
  device,
  connectionUuid,
  currentIPv4,
  isManagementInterface,
  onConfirmationRequired,
  onRollbackStarted,
  onApplied,
}: IPSettingsPanelProps) {
  const t = useTranslate('editor');
  const currentMethod = currentIPv4?.method ?? 'auto';

  const [method, setMethod] = useState<'auto' | 'manual'>(currentMethod);
  const [address, setAddress] = useState(currentIPv4?.address ?? '');
  const [prefix, setPrefix] = useState(String(currentIPv4?.prefix ?? 24));
  const [gateway, setGateway] = useState(currentIPv4?.gateway ?? '');
  const [dnsList, setDnsList] = useState<string[]>(
    currentIPv4?.dns && currentIPv4.dns.length > 0 ? currentIPv4.dns : [''],
  );

  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync fields when external data changes (overview refresh)
  useEffect(() => {
    setMethod(currentIPv4?.method ?? 'auto');
    setAddress(currentIPv4?.address ?? '');
    setPrefix(String(currentIPv4?.prefix ?? 24));
    setGateway(currentIPv4?.gateway ?? '');
    setDnsList(
      currentIPv4?.dns && currentIPv4.dns.length > 0 ? currentIPv4.dns : [''],
    );
  }, [currentIPv4]);

  /* ── DNS list helpers ─────────────────────── */

  const updateDns = (idx: number, val: string) => {
    setDnsList((prev) => prev.map((v, i) => (i === idx ? val : v)));
  };

  const removeDns = (idx: number) => {
    setDnsList((prev) => prev.filter((_, i) => i !== idx));
  };

  const addDns = () => {
    setDnsList((prev) => [...prev, '']);
  };

  /* ── Apply handler ────────────────────────── */

  const doApply = async (confirmed?: boolean) => {
    if (applying) return;

    setApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const body: Record<string, unknown> = {
        connectionId: connectionUuid,
        method,
      };

      if (method === 'manual') {
        body.address = address.trim();
        body.prefix = parseInt(prefix, 10);
        body.gateway = gateway.trim();
        body.dns = dnsList.map((d) => d.trim()).filter(Boolean);
      }

      if (confirmed) body.confirmed = true;

      const res = await editorFetch('/api/system/network/ip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.requiresConfirmation) {
        // Bubble up to parent for confirmation modal
        onConfirmationRequired(data.warning, () => doApply(true));
        return;
      }

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? t('settings.networkPage.ipSettings.defaultErrorMessage'));
        return;
      }

      if (data.rollbackId) {
        onRollbackStarted(data.rollbackId);
      } else {
        setSuccessMsg(t('settings.networkPage.ipSettings.successMessage'));
        setTimeout(() => setSuccessMsg(null), 3000);
        onApplied();
      }
    } catch {
      setErrorMsg(t('common.serverUnreachable'));
    } finally {
      setApplying(false);
    }
  };

  /* ── Field readonly hint ───────────────────── */

  const isDhcp = method === 'auto';

  /* ── Render ───────────────────────────────── */

  return (
    <div className="bg-hs-card rounded-lg border border-hs-border p-4 mt-2">
      {/* Panel heading */}
      <h4 className="text-xs font-semibold text-hs-text-muted uppercase tracking-wider mb-3">
        {t('settings.networkPage.ipSettings.heading', { device })}
      </h4>

      {/* Method radio */}
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`ip-method-${device}`}
            value="auto"
            checked={method === 'auto'}
            onChange={() => setMethod('auto')}
            className="accent-hs-accent"
          />
          <span className="text-sm text-hs-text-body">
            {t('settings.networkPage.ipSettings.method.auto')}
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name={`ip-method-${device}`}
            value="manual"
            checked={method === 'manual'}
            onChange={() => setMethod('manual')}
            className="accent-hs-accent"
          />
          <span className="text-sm text-hs-text-body">
            {t('settings.networkPage.ipSettings.method.manual')}
          </span>
        </label>
      </div>

      {/* IP fields */}
      <div className="space-y-3">
        {/* Address */}
        <div>
          <label className="block text-xs font-medium text-hs-text-muted mb-1">
            {t('settings.networkPage.ipSettings.addressLabel')}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            readOnly={isDhcp}
            placeholder={t('settings.networkPage.ipSettings.addressPlaceholder')}
            className={`bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary w-full font-mono ${
              isDhcp ? 'opacity-60 cursor-default' : ''
            }`}
          />
        </div>

        {/* Subnet prefix */}
        <div>
          <label className="block text-xs font-medium text-hs-text-muted mb-1">
            {t('settings.networkPage.ipSettings.prefixLabel')}
          </label>
          <input
            type="number"
            min={1}
            max={32}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            readOnly={isDhcp}
            placeholder={t('settings.networkPage.ipSettings.prefixPlaceholder')}
            className={`bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary w-full font-mono ${
              isDhcp ? 'opacity-60 cursor-default' : ''
            }`}
          />
        </div>

        {/* Gateway */}
        <div>
          <label className="block text-xs font-medium text-hs-text-muted mb-1">
            {t('settings.networkPage.ipSettings.gatewayLabel')}
          </label>
          <input
            type="text"
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            readOnly={isDhcp}
            placeholder={t('settings.networkPage.ipSettings.gatewayPlaceholder')}
            className={`bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary w-full font-mono ${
              isDhcp ? 'opacity-60 cursor-default' : ''
            }`}
          />
        </div>

        {/* DNS servers */}
        <div>
          <label className="block text-xs font-medium text-hs-text-muted mb-1">
            {t('settings.networkPage.ipSettings.dnsLabel')}
          </label>
          <div className="space-y-1.5">
            {dnsList.map((dns, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={dns}
                  onChange={(e) => updateDns(idx, e.target.value)}
                  readOnly={isDhcp}
                  placeholder={t('settings.networkPage.ipSettings.dnsPlaceholder')}
                  className={`bg-hs-bg border border-hs-border rounded px-3 py-2 text-sm text-hs-text-primary flex-1 font-mono ${
                    isDhcp ? 'opacity-60 cursor-default' : ''
                  }`}
                />
                {!isDhcp && (
                  <button
                    type="button"
                    onClick={() => removeDns(idx)}
                    disabled={dnsList.length <= 1}
                    className="text-hs-text-faint hover:text-hs-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1"
                    aria-label={t('settings.networkPage.ipSettings.removeDnsAriaLabel')}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isDhcp && (
            <button
              type="button"
              onClick={addDns}
              className="mt-1.5 text-xs text-hs-accent hover:text-hs-accent-hover transition-colors"
            >
              {t('settings.networkPage.ipSettings.addDnsButton')}
            </button>
          )}
        </div>

        {/* DHCP hint */}
        {isDhcp && (
          <p className="text-xs text-hs-text-faint italic">
            {t('settings.networkPage.ipSettings.dhcpHint')}
          </p>
        )}
      </div>

      {/* Apply row */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          {errorMsg && <p className="text-xs text-hs-danger">{errorMsg}</p>}
          {successMsg && <p className="text-xs text-hs-success">{successMsg}</p>}
          {isManagementInterface && (
            <p className="text-xs text-hs-text-faint">
              {t('settings.networkPage.ipSettings.managementInterfaceHint')}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => doApply()}
          disabled={applying}
          className="shrink-0 ml-3"
        >
          {applying
            ? t('settings.networkPage.ipSettings.applyingButton')
            : t('settings.networkPage.ipSettings.applyButton')}
        </Button>
      </div>
    </div>
  );
}
