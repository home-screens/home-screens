'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { validateSandbox, validateIframeUrl } from '@/lib/iframe-validation';
import { TEXT_OPACITY } from '@/lib/constants';
import type { IframeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';

interface IframeModuleProps {
  config: IframeConfig;
  style: ModuleStyle;
}

export default function IframeModule({ config, style }: IframeModuleProps) {
  // Append a cache-busting key to force iframe reload on refresh interval
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!config.refreshIntervalMs || config.refreshIntervalMs <= 0) return;
    const id = setInterval(reload, config.refreshIntervalMs);
    return () => clearInterval(id);
  }, [config.refreshIntervalMs, reload]);

  // Runtime URL validation — block dangerous protocols
  const urlError = useMemo(() => validateIframeUrl(config.url), [config.url]);

  // Runtime sandbox validation — strip dangerous combinations
  const safeSandbox = useMemo(() => {
    if (!config.sandboxEnabled) return undefined;
    const result = validateSandbox(config.sandbox || '');
    if (result.dangerousCombination) {
      // Strip allow-same-origin to defuse the combination
      return result.sanitized
        .split(' ')
        .filter((t) => t !== 'allow-same-origin')
        .join(' ');
    }
    return result.sanitized;
  }, [config.sandboxEnabled, config.sandbox]);

  if (!config.url || urlError) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex items-center justify-center h-full" style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>
          {urlError ?? 'No URL set'}
        </div>
      </ModuleWrapper>
    );
  }

  // Build the src with a cache-busting param for refreshes.
  // Use the URL API to correctly insert before any hash fragment.
  const src = (() => {
    if (refreshKey <= 0) return config.url;
    try {
      const u = new URL(config.url);
      u.searchParams.set('_r', String(refreshKey));
      return u.toString();
    } catch {
      return config.url;
    }
  })();

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <iframe
        src={src}
        title={config.title || 'Embedded content'}
        className="w-full h-full border-0"
        style={{
          borderRadius: `${style.borderRadius}px`,
          overflow: 'hidden',
        }}
        scrolling={config.scrollable ? 'yes' : 'no'}
        loading="lazy"
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        {...(safeSandbox !== undefined ? { sandbox: safeSandbox } : {})}
      />
    </ModuleWrapper>
  );
}
