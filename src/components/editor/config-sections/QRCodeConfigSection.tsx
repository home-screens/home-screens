'use client';

import { useTranslate } from '@/i18n';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, QRCodeConfig } from '@/types/config';

export function QRCodeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<QRCodeConfig>(mod, screenId);
  const mode = c.mode ?? 'custom';

  const MODE_OPTIONS = [
    { value: 'custom', label: t('configSections.qr-code.modeCustom') },
    { value: 'wifi', label: t('configSections.qr-code.modeWifi') },
  ] as const;

  const AUTH_OPTIONS = [
    { value: 'WPA', label: t('configSections.qr-code.authWPA') },
    { value: 'WEP', label: t('configSections.qr-code.authWEP') },
    { value: 'nopass', label: t('configSections.qr-code.authNone') },
  ] as const;

  return (
    <>
      <LabeledSelect
        label={t('configSections.qr-code.mode')}
        value={mode}
        onChange={(v) => set({ mode: v as QRCodeConfig['mode'] })}
        options={MODE_OPTIONS}
      />

      {mode === 'wifi' ? (
        <>
          <LabeledInput
            label={t('configSections.qr-code.networkName')}
            value={c.ssid || ''}
            onChange={(v) => set({ ssid: v })}
            placeholder="MyNetwork"
          />
          <LabeledSelect
            label={t('configSections.qr-code.encryption')}
            value={c.authType || 'WPA'}
            onChange={(v) => set({ authType: v as QRCodeConfig['authType'] })}
            options={AUTH_OPTIONS}
          />
          {(c.authType || 'WPA') !== 'nopass' && (
            <LabeledInput
              label={t('configSections.qr-code.password')}
              value={c.password || ''}
              onChange={(v) => set({ password: v })}
              placeholder={t('configSections.qr-code.passwordPlaceholder')}
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={c.hiddenNetwork ?? false}
              onChange={(e) => set({ hiddenNetwork: e.target.checked })}
              className="accent-cyan-500"
            />
            <span className="text-xs text-hs-text-muted">{t('configSections.qr-code.hiddenNetwork')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={c.showNetworkName ?? true}
              onChange={(e) => set({ showNetworkName: e.target.checked })}
              className="accent-cyan-500"
            />
            <span className="text-xs text-hs-text-muted">{t('configSections.qr-code.showNetworkName')}</span>
          </label>
          {(c.authType || 'WPA') !== 'nopass' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={c.showPassword ?? true}
                onChange={(e) => set({ showPassword: e.target.checked })}
                className="accent-cyan-500"
              />
              <span className="text-xs text-hs-text-muted">{t('configSections.qr-code.showPassword')}</span>
            </label>
          )}
        </>
      ) : (
        <>
          <LabeledInput
            label={t('configSections.qr-code.dataUrlOrText')}
            value={c.data || ''}
            onChange={(v) => set({ data: v })}
            placeholder="https://example.com"
          />
          <LabeledInput
            label={t('configSections.qr-code.label')}
            value={c.label || ''}
            onChange={(v) => set({ label: v })}
          />
        </>
      )}

      <ColorPicker label={t('configSections.qr-code.qrColor')} value={c.fgColor || '#ffffff'} onChange={(v) => set({ fgColor: v })} />
      <ColorPicker label={t('configSections.qr-code.background')} value={c.bgColor || 'transparent'} onChange={(v) => set({ bgColor: v })} />
    </>
  );
}
