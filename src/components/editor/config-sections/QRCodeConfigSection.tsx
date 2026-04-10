'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, QRCodeConfig } from '@/types/config';

export function QRCodeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<QRCodeConfig>(mod, screenId);
  const mode = c.mode ?? 'custom';

  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Mode</span>
        <select
          value={mode}
          onChange={(e) => set({ mode: e.target.value as QRCodeConfig['mode'] })}
          className={INPUT_CLASS}
        >
          <option value="custom">Custom (URL / Text)</option>
          <option value="wifi">WiFi Password</option>
        </select>
      </label>

      {mode === 'wifi' ? (
        <>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Network Name (SSID)</span>
            <input
              type="text"
              value={c.ssid || ''}
              onChange={(e) => set({ ssid: e.target.value })}
              placeholder="MyNetwork"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Encryption</span>
            <select
              value={c.authType || 'WPA'}
              onChange={(e) => set({ authType: e.target.value as QRCodeConfig['authType'] })}
              className={INPUT_CLASS}
            >
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">None (Open)</option>
            </select>
          </label>
          {(c.authType || 'WPA') !== 'nopass' && (
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-hs-text-muted">Password</span>
              <input
                type="text"
                value={c.password || ''}
                onChange={(e) => set({ password: e.target.value })}
                placeholder="WiFi password"
                className={INPUT_CLASS}
              />
            </label>
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
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Data (URL or text)</span>
            <input
              type="text"
              value={c.data || ''}
              onChange={(e) => set({ data: e.target.value })}
              placeholder="https://example.com"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Label</span>
            <input
              type="text"
              value={c.label || ''}
              onChange={(e) => set({ label: e.target.value })}
              className={INPUT_CLASS}
            />
          </label>
        </>
      )}

      <ColorPicker label="QR Color" value={c.fgColor || '#ffffff'} onChange={(v) => set({ fgColor: v })} />
      <ColorPicker label="Background" value={c.bgColor || 'transparent'} onChange={(v) => set({ bgColor: v })} />
    </>
  );
}
