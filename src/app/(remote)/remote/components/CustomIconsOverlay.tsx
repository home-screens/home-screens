'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Play, Plus } from 'lucide-react';
import { useLocale, useTranslate } from '@/i18n';
import FormOverlay from './FormOverlay';
import ConfirmSheet from './ConfirmSheet';
import SheetFrame from './SheetFrame';
import PhoneCustomIconReviewSheet from '@/components/custom-icons/PhoneCustomIconReviewSheet';
import {
  deleteCustomIcon,
  fetchCustomIconUsage,
  renameCustomIcon,
  useCustomIcons,
} from '@/hooks/useCustomIcons';
import { useCustomIconUpload } from '@/hooks/useCustomIconUpload';
import { isSessionExpired } from '@/lib/editor-fetch';
import {
  ACCEPT_ATTRIBUTE,
  LIBRARY_BUDGET_BYTES,
  formatIconBytes,
  normalizeIconName,
  type CustomIconEntry,
  type CustomIconUsage,
} from '@/lib/custom-icons';
import { customIconUseCount, customIconUseRows } from '@/lib/custom-icon-usage';
import { formatDateInTZ } from '@/lib/timezone';
import { useHouseholdTimezone } from '../household-clock';
import { DANGER_BUTTON, FIELD_LABEL, REMOTE_ACCENT } from './remote-styles';
import PrimaryButton from './PrimaryButton';
import { buildDeleteConfirm, sheetQuestion } from '@/lib/delete-confirmations';

/**
 * The phone's "Your icons" page: every picture the family added, how much
 * room is left, which ones are in use, and rename or remove for each.
 * Reached from Settings and from a picker's Manage link. Settings is a
 * sheet, so the page always takes the rung over one.
 */
export default function CustomIconsOverlay({ onBack }: { onBack: () => void }) {
  const t = useTranslate('core');
  const locale = useLocale();
  const { icons, bytes } = useCustomIcons();
  const [usage, setUsage] = useState<Record<string, CustomIconUsage>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const upload = useCustomIconUpload(() => { void loadUsage(); });

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await fetchCustomIconUsage());
    } catch { /* badges just stay off */ }
  }, []);
  useEffect(() => { void loadUsage(); }, [loadUsage]);

  const share = Math.min(1, bytes / LIBRARY_BUDGET_BYTES);
  const open = icons.find((icon) => icon.id === openId) ?? null;

  return (
    <>
      <FormOverlay title={t('customIcons.page.title')} onBack={onBack} layer="sheetOverSheet">
        <div style={{ margin: '4px 0 18px' }}>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--hs-bg-card)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(share * 100, bytes ? 1.5 : 0)}%`, borderRadius: 4, background: share > 0.8 ? 'var(--hs-warning)' : REMOTE_ACCENT }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--hs-text-muted)', marginTop: 6 }}>
            <span>{t('customIcons.page.count', { count: icons.length })}</span>
            <span>{t('customIcons.page.used', { used: formatIconBytes(bytes, locale), max: formatIconBytes(LIBRARY_BUDGET_BYTES, locale) })}</span>
          </div>
        </div>

        {icons.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--hs-text-muted)', margin: '0 0 12px' }}>{t('customIcons.page.tapHint')}</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <button
            type="button"
            onClick={upload.choose}
            className="press-scale-sm"
            style={{ ...TILE, background: 'transparent', border: '2px dashed var(--hs-border-strong)', color: 'var(--hs-text-muted)', justifyContent: 'center', minHeight: 94 }}
          >
            <Plus size={24} strokeWidth={1.75} aria-hidden />
            <span style={{ fontSize: 12 }}>{t('customIcons.add')}</span>
          </button>
          {icons.map((icon) => (
            <button key={icon.id} type="button" onClick={() => setOpenId(icon.id)} className="press-scale-sm" style={TILE} aria-label={icon.name}>
              {customIconUseCount(usage[icon.id]) > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: 'var(--hs-success)' }} />
              )}
              <img src={icon.url} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
              <span
                style={{
                  fontSize: 12, lineHeight: 1.25, color: 'var(--hs-text-secondary)', maxWidth: '100%', textAlign: 'center',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere',
                }}
              >
                {icon.name}
              </span>
              {icon.animated && (
                <span aria-hidden style={{ position: 'absolute', top: 6, left: 6, color: 'var(--hs-text-faint)' }}><Play size={9} fill="currentColor" strokeWidth={0} /></span>
              )}
            </button>
          ))}
        </div>
        {icons.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--hs-text-muted)', marginTop: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--hs-success)' }} />
            {t('customIcons.page.inUseLegend')}
          </div>
        )}
        <input ref={upload.inputRef} type="file" accept={ACCEPT_ATTRIBUTE} onChange={upload.onFileChange} hidden data-testid="custom-icon-file" />
      </FormOverlay>

      {upload.state.step !== 'idle' && <PhoneCustomIconReviewSheet upload={upload} />}
      {open && (
        <IconSheet
          key={open.id}
          icon={open}
          usage={usage[open.id]}
          onClose={() => setOpenId(null)}
          onChanged={() => { void loadUsage(); }}
        />
      )}
    </>
  );
}

const TILE: CSSProperties = {
  position: 'relative',
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
  borderRadius: 14,
  padding: '10px 6px 8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 0,
};

function IconSheet({ icon, usage, onClose, onChanged }: {
  icon: CustomIconEntry;
  usage: CustomIconUsage | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslate('core');
  const locale = useLocale();
  const timezone = useHouseholdTimezone();
  const [name, setName] = useState(icon.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rows = customIconUseRows(usage);
  const uses = customIconUseCount(usage);

  const save = async () => {
    const next = normalizeIconName(name);
    if (!next || next === icon.name) { onClose(); return; }
    setBusy(true);
    try {
      await renameCustomIcon(icon.id, next);
      onChanged();
      onClose();
    } catch (error) {
      if (!isSessionExpired(error)) setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCustomIcon(icon.id);
      onChanged();
      onClose();
    } catch (error) {
      if (!isSessionExpired(error)) setBusy(false);
    }
  };

  if (confirming) {
    return (
      <ConfirmSheet
        {...sheetQuestion(buildDeleteConfirm({
          verb: 'delete',
          name: icon.name,
          consequence: uses ? t('customIcons.remove.inUse', { count: uses }) : t('customIcons.remove.notUsed'),
        }, t))}
        cancelLabel={t('customIcons.remove.keep')}
        icon={
          <img src={icon.url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', display: 'inline-block' }} />
        }
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    // Drawn at the end of the page, over the Your icons page it is opened from.
    <SheetFrame
      layer="sheetOverSheet"
      portal
      label={icon.name}
      title={icon.name}
      onClose={busy ? undefined : onClose}
      handle
      bottomGap={24}
      panelStyle={{
        background: 'var(--hs-bg-panel)', borderRadius: '20px 20px 0 0', borderTop: '1px solid var(--hs-border-strong)',
        padding: '0 18px', maxHeight: '85dvh', overflowY: 'auto', color: 'var(--hs-text-primary)',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <div
          style={{
            width: 84, height: 84, borderRadius: 16, flexShrink: 0, border: '1px solid var(--hs-border-strong)',
            background: 'repeating-conic-gradient(var(--hs-bg-card) 0 25%, var(--hs-bg-input) 0 50%) 0 0 / 16px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img src={icon.url} alt="" style={{ width: 68, height: 68, objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>
          {t('customIcons.detail.added', {
            // The day it was added at home, as the rest of the phone counts days.
            date: formatDateInTZ(new Date(icon.createdAt), timezone, { month: 'short', day: 'numeric' }, locale),
            size: formatIconBytes(icon.bytes, locale),
          })}
          {icon.animated && <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Play size={11} aria-hidden="true" />{t('customIcons.moving')}</div>}
        </div>
      </div>

      <label htmlFor="custom-icon-rename" style={FIELD_LABEL}>{t('customIcons.review.nameLabel')}</label>
      <input
        id="custom-icon-rename"
        type="text"
        value={name}
        maxLength={32}
        onChange={(event) => setName(event.target.value)}
        style={{
          width: '100%', minHeight: 48, padding: '12px 16px', marginBottom: 14, background: 'var(--hs-bg-input)',
          border: '1px solid var(--hs-border)', borderRadius: 12, color: 'var(--hs-text-primary)', fontSize: 16, outline: 'none',
        }}
      />

      {rows.length > 0 && (
        <>
          <div style={FIELD_LABEL}>{t('customIcons.detail.usedBy')}</div>
          <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, border: '1px solid var(--hs-border)', borderRadius: 12, overflow: 'hidden' }}>
            {rows.map((row, i) => (
              <li
                key={`${row.kind}-${row.name}-${i}`}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 14px', fontSize: 14, borderTop: i ? '1px solid var(--hs-border)' : undefined }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.kind === 'screen' ? t('customIcons.page.usedIn', { count: row.count ?? 1 }) : row.name}
                </span>
                <span style={{ color: 'var(--hs-text-faint)', flexShrink: 0 }}>{t(`customIcons.kinds.${row.kind}`)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <PrimaryButton busy={busy} onClick={() => void save()} style={{ marginTop: 0 }}>
        {t('customIcons.detail.save')}
      </PrimaryButton>
      <button
        type="button"
        className="press-scale"
        disabled={busy}
        onClick={() => setConfirming(true)}
        style={{ ...DANGER_BUTTON, marginTop: 8 }}
      >
        {t('customIcons.detail.remove')}
      </button>
    </SheetFrame>
  );
}

