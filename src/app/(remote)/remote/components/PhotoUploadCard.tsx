'use client';

import { CircleCheck, MonitorUp, TriangleAlert, X } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { formatBytes } from '@/lib/format-bytes';
import { MAX_IMAGE_BYTES } from '@/lib/media-formats';
import { PHONE_VIDEO_MAX_BYTES, type UploadFailure, type UploadRun } from '../hooks/usePhotoUploads';
import PhoneSpinner from './PhoneSpinner';

const CARD: React.CSSProperties = {
  borderRadius: 14,
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
  padding: '12px 14px',
  marginBottom: 12,
};

/**
 * While photos are sending, this card stands where the add button was: the
 * count, a real progress bar and what is left to send. When the batch is
 * done with something to report (a failure, or one photo that could go on
 * the wall right now) it says where the photos went and lists every file
 * that could not be added, with its reason, until it is closed.
 */
export default function PhotoUploadCard({
  run,
  whereTheyShow,
  onClose,
  onShowOnWall,
}: {
  run: UploadRun;
  /** "They'll show on Kitchen." and the like, for what was added. */
  whereTheyShow: string;
  onClose: () => void;
  /** Offered when exactly one file went in: put it on the wall now. */
  onShowOnWall?: () => void;
}) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();

  if (!run.finished) {
    return (
      <div style={CARD} data-testid="photo-upload-progress" role="status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, color: 'var(--hs-text-primary)' }}>
          <PhoneSpinner />
          {t('photosTab.upload.progress', { current: Math.min(run.current + 1, run.total), total: run.total })}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--hs-text-faint)' }}>
            {t('photosTab.upload.left', { size: formatBytes(run.bytesLeft, locale) })}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--hs-border)', overflow: 'hidden', margin: '10px 0 8px' }}>
          <i style={{ display: 'block', height: '100%', width: `${Math.round(run.progress * 100)}%`, background: 'var(--hs-accent)', borderRadius: 3, transition: 'width 0.2s linear' }} />
        </div>
        {run.hasPhotos && (
          <div style={{ fontSize: 12.5, color: 'var(--hs-text-faint)', lineHeight: 1.4 }}>{t('photosTab.upload.shrinking')}</div>
        )}
      </div>
    );
  }

  const added = run.added.length;
  return (
    <div style={CARD} data-testid="photo-upload-result">
      {added > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--hs-text-primary)', lineHeight: 1.4 }}>
          <CircleCheck size={18} style={{ color: 'var(--hs-success)', marginTop: 1, flex: 'none' }} aria-hidden="true" />
          <span>
            <b>{t('photosTab.upload.added', { count: added })}</b> {whereTheyShow}
          </span>
          <CloseButton onClose={onClose} label={t('photosTab.upload.close')} />
        </div>
      )}
      {run.failures.length > 0 && (
        <div
          style={{
            marginTop: added > 0 ? 10 : 0,
            paddingTop: added > 0 ? 10 : 0,
            borderTop: added > 0 ? '1px solid var(--hs-border)' : 'none',
            fontSize: 13,
            color: 'var(--hs-text-muted)',
          }}
        >
          <div style={{ color: 'var(--hs-warning-ink)', display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
            <TriangleAlert size={18} aria-hidden="true" />
            {t('photosTab.upload.failedHeading', { count: run.failures.length })}
            {added === 0 && <CloseButton onClose={onClose} label={t('photosTab.upload.close')} />}
          </div>
          <ul style={{ margin: '6px 0 0 26px', padding: '0 0 0 4px', lineHeight: 1.45 }} data-testid="photo-upload-failures">
            {run.failures.map((failure, i) => (
              <li key={`${failure.name}-${i}`} style={{ margin: '3px 0' }}>
                <FailureLine failure={failure} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {onShowOnWall && (
        <button
          type="button"
          onClick={onShowOnWall}
          data-testid="photo-upload-show"
          className="press-btn"
          style={{
            width: '100%',
            minHeight: 44,
            marginTop: 12,
            borderRadius: 12,
            border: 'none',
            background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-body)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <MonitorUp size={18} aria-hidden="true" />
          {t('photosTab.upload.showNow')}
        </button>
      )}
    </div>
  );
}

function CloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      data-testid="photo-upload-close"
      style={{ marginLeft: 'auto', marginTop: -12, marginRight: -12, width: 44, height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--hs-text-faint)', cursor: 'pointer' }}
    >
      <X size={18} aria-hidden="true" />
    </button>
  );
}

function FailureLine({ failure }: { failure: UploadFailure }) {
  const t = useTranslate('remote');
  const name = <b style={{ color: 'var(--hs-text-body)', fontWeight: 600 }}>{failure.name}</b>;
  const MARK = '\u0001';
  const template = failure.problem === 'tooBigPhoto'
    ? t('photosTab.upload.tooBig', { name: MARK, size: formatBytes(MAX_IMAGE_BYTES) })
    : failure.problem === 'tooBigVideo'
      ? t('photosTab.upload.tooBig', { name: MARK, size: formatBytes(PHONE_VIDEO_MAX_BYTES) })
      : failure.problem === 'notMedia'
        ? t('photosTab.upload.notMedia', { name: MARK })
        : failure.problem === 'wontPlay'
          ? t('photosTab.upload.wontPlay', { name: MARK })
          : t('photosTab.upload.failed', { name: MARK });
  const [before, after = ''] = template.split(MARK);
  return <>{before}{name}{after}</>;
}
