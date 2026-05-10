'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { QRCodeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { buildWifiString } from '@/lib/wifi-qr';

interface QRCodeModuleProps {
  config: QRCodeConfig;
  style: ModuleStyle;
}

export default function QRCodeModule({ config, style }: QRCodeModuleProps) {
  const t = useTranslate('modules');
  const fgColor = config.fgColor || '#ffffff';
  const bgColor = config.bgColor || 'transparent';
  const mode = config.mode ?? 'custom';

  const qrData = mode === 'wifi'
    ? buildWifiString(config.ssid || '', config.password || '', config.authType || 'WPA', config.hiddenNetwork ?? false)
    : config.data;

  const hasData = mode === 'wifi' ? !!(config.ssid) : !!config.data;

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col items-center justify-center h-full w-full gap-2">
        {hasData ? (
          <>
            <QRCodeSVG
              value={qrData}
              fgColor={fgColor}
              bgColor={bgColor}
              style={{ width: '80%', height: '80%', maxWidth: '100%', maxHeight: '100%' }}
            />
            {mode === 'wifi' ? (
              <div className="flex flex-col items-center gap-0.5">
                {(config.showNetworkName ?? true) && config.ssid && (
                  <span className="text-center" style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.heading }}>
                    <WifiIcon /> {config.ssid}
                  </span>
                )}
                {(config.showPassword ?? true) && config.password && config.authType !== 'nopass' && (
                  <span className="text-center font-mono" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>
                    {config.password}
                  </span>
                )}
                {!(config.showNetworkName ?? true) && !(config.showPassword ?? true) && (
                  <span className="text-center" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.dim }}>
                    {t('qr-code.scanToConnect')}
                  </span>
                )}
              </div>
            ) : (
              config.label && (
                <span className="text-center" style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.heading }}>{config.label}</span>
              )
            )}
          </>
        ) : (
          <span style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>
            {mode === 'wifi' ? t('qr-code.configureWifi') : t('qr-code.configureData')}
          </span>
        )}
      </div>
    </ModuleWrapper>
  );
}

function WifiIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '1em', height: '1em', display: 'inline', verticalAlign: 'middle', marginRight: '0.25em' }}
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}
