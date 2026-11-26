'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { GROWN_UP_CODE_LENGTH, isGrownUpCode } from '@/lib/grown-up-code';
import { showToast } from '../remote-toast';
import BottomSheet from './BottomSheet';
import PrimaryButton from './PrimaryButton';
import { HELPER_TEXT, SHEET_FIELD, SHEET_LABEL } from './remote-styles';
import type { RemoteLayer } from './remote-layers';

type Problem = 'format' | 'mismatch' | 'failed';

/**
 * Set or change the grown-up code from a signed-in phone: four numbers, typed
 * twice. Which jobs ask for it stays in the editor (Settings > Family); a new
 * code guards spending tickets, the one a child most wants to do alone.
 */
export default function GrownUpCodeSetSheet({ changing, layer = 'sheet', onClose, onSaved }: {
  /** A code is set already: the sheet changes it. */
  changing: boolean;
  layer?: RemoteLayer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!isGrownUpCode(code)) { setProblem('format'); return; }
    if (code !== again) { setProblem('mismatch'); return; }
    setProblem(null);
    setBusy(true);
    try {
      const res = await editorFetch('/api/grown-up-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(t('grownUpCode.saved'));
      onSaved();
      onClose();
    } catch (err) {
      if (!isSessionExpired(err)) setProblem('failed');
    } finally {
      setBusy(false);
    }
  };

  const digits = (value: string) => value.replace(/\D/g, '').slice(0, GROWN_UP_CODE_LENGTH);
  const field = (value: string, set: (v: string) => void, label: string, testId: string) => (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={SHEET_LABEL}>{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={GROWN_UP_CODE_LENGTH}
        value={value}
        onChange={(e) => { set(digits(e.target.value)); setProblem(null); }}
        data-testid={testId}
        style={{ ...SHEET_FIELD, letterSpacing: '0.4em', textAlign: 'center', fontSize: 20 }}
      />
    </label>
  );

  return (
    <BottomSheet
      title={t(changing ? 'grownUpCode.changeTitle' : 'grownUpCode.setTitle')}
      onClose={onClose}
      layer={layer}
      testId="grown-up-code-sheet"
      initialFocus="field"
    >
      <p style={{ ...HELPER_TEXT, margin: '0 0 16px' }}>{t('grownUpCode.explain')}</p>
      {field(code, setCode, t('grownUpCode.codeLabel'), 'grown-up-code-new')}
      {field(again, setAgain, t('grownUpCode.againLabel'), 'grown-up-code-again')}
      {problem && (
        <p role="alert" style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--hs-danger)' }}>{problem === 'failed' ? tCore('refusals.saveFailed') : t(`grownUpCode.problem.${problem}`)}</p>
      )}
      <PrimaryButton busy={busy} onClick={() => void save()} data-testid="grown-up-code-save">
        {t('grownUpCode.save')}
      </PrimaryButton>
    </BottomSheet>
  );
}
