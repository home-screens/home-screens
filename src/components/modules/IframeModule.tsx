'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslate } from '@/i18n';
import { validateSandbox, validateIframeUrl } from '@/lib/iframe-validation';
import type { IframeConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState } from './ModuleStates';

interface IframeModuleProps {
  config: IframeConfig;
  style: ModuleStyle;
}

export default function IframeModule({ config, style }: IframeModuleProps) {
  const t = useTranslate('modules');
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
    return <ModuleEmptyState style={style} type="iframe" message={urlError ?? t('iframe.noUrl')} />;
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
        title={config.title || t('iframe.embeddedTitle')}
        className="w-full h-full border-0"
        style={{
          display: 'block',
          borderRadius: `${style.borderRadius}px`,
          overflow: 'hidden',
          // Don't inherit the app's color-scheme: a dark scheme on the iframe
          // element makes Chromium paint an opaque canvas behind light embeds
          // and flips prefers-color-scheme-aware embeds to dark. User embeds
          // must render the same regardless of the app's own theme.
          colorScheme: 'normal',
        }}
        scrolling={config.scrollable ? 'yes' : 'no'}
        loading="eager"
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        {...(safeSandbox !== undefined ? { sandbox: safeSandbox } : {})}
      />
    </ModuleWrapper>
  );
}
