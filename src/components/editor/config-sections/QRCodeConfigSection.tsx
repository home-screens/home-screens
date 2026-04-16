'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, QRCodeConfig } from '@/types/config';

const MODE_OPTIONS = [
  { value: 'custom', label: 'Custom (URL / Text)' },
  { value: 'wifi', label: 'WiFi Password' },
] as const;

const AUTH_OPTIONS = [
  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'None (Open)' },
] as const;

export function QRCodeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<QRCodeConfig>(mod, screenId);
  const mode = c.mode ?? 'custom';

  return (
    <>
      <LabeledSelect
        label="Mode"
        value={mode}
        onChange={(v) => set({ mode: v as QRCodeConfig['mode'] })}
        options={MODE_OPTIONS}
      />

      {mode === 'wifi' ? (
        <>
          <LabeledInput
            label="Network Name (SSID)"
            value={c.ssid || ''}
            onChange={(v) => set({ ssid: v })}
            placeholder="MyNetwork"
          />
          <LabeledSelect
            label="Encryption"
            value={c.authType || 'WPA'}
            onChange={(v) => set({ authType: v as QRCodeConfig['authType'] })}
            options={AUTH_OPTIONS}
          />
          {(c.authType || 'WPA') !== 'nopass' && (
            <LabeledInput
              label="Password"
              value={c.password || ''}
              onChange={(v) => set({ password: v })}
              placeholder="WiFi password"
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={c.hiddenNetwork ?? false}
              onChange={(e) => set({ hiddenNetwork: e.target.checked })}
              className="accent-cyan-500"
            />
            <span className="text-xs text-hs-text-muted">Hidden Network</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={c.showNetworkName ?? true}
              onChange={(e) => set({ showNetworkName: e.target.checked })}
              className="accent-cyan-500"
            />
            <span className="text-xs text-hs-text-muted">Show Network Name</span>
          </label>
          {(c.authType || 'WPA') !== 'nopass' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={c.showPassword ?? true}
                onChange={(e) => set({ showPassword: e.target.checked })}
                className="accent-cyan-500"
              />
              <span className="text-xs text-hs-text-muted">Show Password</span>
            </label>
          )}
        </>
      ) : (
        <>
          <LabeledInput
            label="Data (URL or text)"
            value={c.data || ''}
            onChange={(v) => set({ data: v })}
            placeholder="https://example.com"
          />
          <LabeledInput
            label="Label"
            value={c.label || ''}
            onChange={(v) => set({ label: v })}
          />
        </>
      )}

      <ColorPicker label="QR Color" value={c.fgColor || '#ffffff'} onChange={(v) => set({ fgColor: v })} />
      <ColorPicker label="Background" value={c.bgColor || 'transparent'} onChange={(v) => set({ bgColor: v })} />
    </>
  );
}
