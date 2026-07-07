'use client';

import { useTranslate } from '@/i18n';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
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
            placeholder={t('configSections.qr-code.networkNamePlaceholder')}
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
          <Toggle
            label={t('configSections.qr-code.hiddenNetwork')}
            checked={c.hiddenNetwork ?? false}
            onChange={(v) => set({ hiddenNetwork: v })}
          />
          <Toggle
            label={t('configSections.qr-code.showNetworkName')}
            checked={c.showNetworkName ?? true}
            onChange={(v) => set({ showNetworkName: v })}
          />
          {(c.authType || 'WPA') !== 'nopass' && (
            <Toggle
              label={t('configSections.qr-code.showPassword')}
              checked={c.showPassword ?? true}
              onChange={(v) => set({ showPassword: v })}
            />
          )}
        </>
      ) : (
        <>
          <LabeledInput
            label={t('configSections.qr-code.dataUrlOrText')}
            value={c.data || ''}
            onChange={(v) => set({ data: v })}
            placeholder={t('configSections.qr-code.dataUrlOrTextPlaceholder')}
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
