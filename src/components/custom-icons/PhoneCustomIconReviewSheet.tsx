'use client';

import type { CSSProperties } from 'react';
import { Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { iconShapeWarning } from '@/lib/custom-icons';
import type { useCustomIconUpload } from '@/hooks/useCustomIconUpload';
import SheetFrame from '@/app/(remote)/remote/components/SheetFrame';
import PrimaryButton from '@/app/(remote)/remote/components/PrimaryButton';
import { REMOTE_ON_ACCENT } from '@/app/(remote)/remote/components/remote-styles';

type Upload = ReturnType<typeof useCustomIconUpload>;

const BUTTON: CSSProperties = {
  width: '100%',
  minHeight: 50,
  borderRadius: 12,
  border: 'none',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/** The wall's light card and the phone's dark panel, so dark artwork that
 *  vanishes on one is seen on the other before it is kept. */
const PREVIEW_TILES = [
  { background: '#f4efe6', border: '#e2dccf' },
  { background: 'var(--hs-bg-card)', border: 'var(--hs-border-strong)' },
];

/**
 * The phone's add-your-own-icon sheet: the processed picture on a light and
 * a dark tile and at the sizes it will really appear, a name, and keep, pick
 * again or cancel. Also carries the working and error states, so the family
 * is never left staring at a form that looks like nothing happened.
 *
 * Leaving is always a button: a tap on the dimmed page behind does nothing,
 * because it quietly threw away a picture the person had just chosen.
 * Scrolls within the screen, so it still fits a phone held sideways.
 *
 * Drawn at the end of the page, so it ranks over every full-screen phone
 * surface it can be opened from: the meal and chore forms, and the Family
 * screen and the Your icons page, which are themselves over a sheet.
 */
export default function PhoneCustomIconReviewSheet({ upload }: { upload: Upload }) {
  const t = useTranslate('core');
  const { state } = upload;
  const review = state.step === 'review' || state.step === 'saving' ? state : null;
  const icon = review?.icon ?? null;
  const busy = state.step === 'saving';
  const shape = icon && !review?.existing ? iconShapeWarning(icon) : null;

  return (
    <SheetFrame
      layer="sheetOverSheet"
      portal
      label={t('customIcons.review.title')}
      title={t('customIcons.review.title')}
      // Escape and Back are Cancel, the one way out this sheet has, which is
      // its own button at the bottom; a tap on the dimmed page still does
      // nothing. Not while the picture is being kept.
      onClose={busy ? undefined : upload.cancel}
      closeOnBackdrop={false}
      closeControl={false}
      testId="custom-icon-review"
      bottomGap={18}
      titleRowStyle={{ marginBottom: 4 }}
      panelStyle={{
        maxHeight: '85dvh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: 'var(--hs-bg-panel)',
        borderRadius: '20px 20px 0 0',
        borderTop: '1px solid var(--hs-border-strong)',
        padding: '18px 18px',
        color: 'var(--hs-text-primary)',
      }}
    >
      {state.step === 'uploading' && (
        <p style={{ fontSize: 14, color: 'var(--hs-text-muted)', margin: '8px 0 20px' }} role="status">
          {t('customIcons.review.working')}
        </p>
      )}

      {state.step === 'error' && (
        <>
          <div
            role="alert"
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.4, margin: '10px 0 14px',
              ...(state.code === 'library-full' || state.code === 'budget-full'
                ? { border: '1px solid color-mix(in srgb, var(--hs-warning) 40%, transparent)', background: 'color-mix(in srgb, var(--hs-warning) 10%, transparent)', color: 'var(--hs-warning-ink)' }
                : { border: '1px solid color-mix(in srgb, var(--hs-danger) 40%, transparent)', background: 'color-mix(in srgb, var(--hs-danger) 10%, transparent)', color: 'var(--hs-danger)' }),
            }}
          >
            {t(`customIcons.errors.${state.code}`)}
          </div>
          <PrimaryButton onClick={upload.pickAnother} style={{ marginTop: 0 }}>
            {t('customIcons.review.pickAnother')}
          </PrimaryButton>
        </>
      )}

      {icon && review && (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--hs-text-muted)', margin: '0 0 14px' }}>
            {review.existing ? t('customIcons.review.existing', { name: icon.name }) : t('customIcons.review.preview')}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            {PREVIEW_TILES.map((tile) => (
              <div
                key={tile.background}
                style={{
                  width: 96, height: 96, borderRadius: 16, flexShrink: 0, background: tile.background,
                  border: `1px solid ${tile.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <img src={icon.url} alt="" style={{ width: 76, height: 76, objectFit: 'contain' }} />
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {icon.animated && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: 'var(--hs-bg-card)', color: 'var(--hs-text-muted)' }}>
                  <Play size={9} fill="currentColor" strokeWidth={0} /> {t('customIcons.moving')}
                </span>
              )}
              {[16, 26].map((size) => (
                <img key={size} src={icon.url} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
              ))}
            </div>
          </div>

          {shape && (
            <div
              role="status"
              style={{
                borderRadius: 12, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.4, marginBottom: 14,
                border: '1px solid color-mix(in srgb, var(--hs-warning) 40%, transparent)',
                background: 'color-mix(in srgb, var(--hs-warning) 10%, transparent)', color: 'var(--hs-warning-ink)',
              }}
            >
              {t(`customIcons.review.${shape}`)}
              {icon.square && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void upload.crop()}
                  style={{
                    display: 'block', marginTop: 8, minHeight: 44, padding: '8px 14px', borderRadius: 10, border: 'none',
                    background: 'var(--hs-warning)', color: REMOTE_ON_ACCENT, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {t('customIcons.review.crop')}
                </button>
              )}
            </div>
          )}

          <label htmlFor="custom-icon-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            {t('customIcons.review.nameLabel')}
          </label>
          <input
            id="custom-icon-name"
            type="text"
            value={review.name}
            maxLength={32}
            onChange={(event) => upload.setName(event.target.value)}
            style={{
              width: '100%', minHeight: 48, padding: '12px 16px', marginBottom: 16, background: 'var(--hs-bg-input)',
              border: '1px solid var(--hs-border)', borderRadius: 12, color: 'var(--hs-text-primary)', fontSize: 16, outline: 'none',
            }}
          />
          <PrimaryButton onClick={() => void upload.confirm()} busy={busy} style={{ marginTop: 0 }}>
            {t('customIcons.review.use')}
          </PrimaryButton>
          <button
            type="button"
            onClick={upload.pickAnother}
            disabled={busy}
            style={{ ...BUTTON, marginTop: 8, fontWeight: 600, background: 'var(--hs-bg-card)', color: 'var(--hs-text-body)' }}
          >
            {t('customIcons.review.pickAnother')}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={upload.cancel}
        disabled={busy}
        style={{ ...BUTTON, marginTop: 8, fontWeight: 600, background: 'transparent', color: 'var(--hs-text-muted)' }}
      >
        {t('actions.cancel')}
      </button>
    </SheetFrame>
  );
}
