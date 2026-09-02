'use client';

import { useMemo } from 'react';
import { useTranslate } from '@/i18n';
import type { MediaListItem, ModuleStyle, VideoConfig } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleEmptyState, ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { videoModuleUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { parseYouTubeVideoId, buildYouTubeEmbedUrl, youTubeThumbnailUrl } from '@/lib/youtube';
import VideoLayer from './shared/VideoLayer';

interface VideoModuleProps {
  config: VideoConfig;
  style: ModuleStyle;
  // Threaded by ScreenRenderer on real displays only; the editor preview gets
  // neither, which is the signal to show a poster frame instead of playing.
  screenId?: string;
  moduleId?: string;
}

const REFRESH_MS = FETCH_KEY_REGISTRY['video']?.ttlMs ?? 600_000;

function PlayBadge() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center" data-testid="video-play-badge">
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}

export default function VideoModule({ config, style, screenId, moduleId }: VideoModuleProps) {
  const t = useTranslate('modules');
  const onRealDisplay = !!(screenId && moduleId);

  // YouTube links can't play through a <video> element — they render the
  // iframe embed player instead (thumbnail-only in the editor).
  const youTubeId = config.source === 'url' ? parseYouTubeVideoId(config.url || '') : null;

  // Library files resolve through the media API's `file=` point lookup rather
  // than building a serve URL directly: that endpoint is where `mt` tokens are
  // minted, and a bare <video src> has no other way to authenticate against
  // the hub. The response is a single-item list; the scan below just verifies
  // the entry really is our file.
  const listUrl = videoModuleUrl(config);
  const [list] = useFetchData<MediaListItem[]>(listUrl ?? '', REFRESH_MS);

  const src = useMemo(() => {
    if (config.source === 'url') return config.url || '';
    if (!config.file || !list) return '';
    for (const item of list) {
      if (item.type !== 'video') continue;
      const fileParam = new URL(item.url, 'http://local').searchParams.get('file');
      if (fileParam === config.file) return item.url;
    }
    return '';
  }, [config.source, config.url, config.file, list]);

  const notConfigured = config.source === 'url' ? !config.url : !config.file;
  if (notConfigured) {
    return <ModuleEmptyState style={style} type="video" message={t('video.empty')} />;
  }

  if (youTubeId) {
    return (
      <ModuleWrapper style={{ ...style, padding: 0 }}>
        <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden', backgroundColor: '#000' }}>
          {onRealDisplay ? (
            <iframe
              src={buildYouTubeEmbedUrl(youTubeId, { muted: config.muted !== false, loop: config.loop !== false })}
              title=""
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 w-full h-full border-0"
              data-testid="youtube-embed"
            />
          ) : (
            <>
              <img
                src={youTubeThumbnailUrl(youTubeId)}
                alt=""
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: config.objectFit }}
              />
              <PlayBadge />
            </>
          )}
        </div>
      </ModuleWrapper>
    );
  }

  if (config.source !== 'url' && list === null) {
    return <ModuleLoadingState style={style} message={t('video.loading')} />;
  }
  if (!src) {
    return <ModuleEmptyState style={style} message={t('video.unavailable')} />;
  }

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
        <VideoLayer
          src={src}
          active
          autoPlay={onRealDisplay}
          objectFit={config.objectFit}
          muted={config.muted !== false}
          loop={config.loop !== false}
          maxDurationMs={config.maxDurationMs}
        />
        {!onRealDisplay && <PlayBadge />}
      </div>
    </ModuleWrapper>
  );
}
