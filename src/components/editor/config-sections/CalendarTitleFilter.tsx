'use client';

import { useState } from 'react';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import type { CalendarTitleFilter } from '@/types/config';

/**
 * Mode select + tag input for `titleFilter`. Terms are added on Enter, comma,
 * or blur, and de-duplicated case-sensitively (matching is case-insensitive
 * at apply time, so near-duplicate casing is harmless to keep separate).
 * Clearing the last term reverts the field to `undefined` (no filter).
 */
export function CalendarTitleFilterControl({
  keyPrefix,
  titleFilter,
  onChange,
}: {
  keyPrefix: string;
  titleFilter: CalendarTitleFilter | undefined;
  onChange: (next: CalendarTitleFilter | undefined) => void;
}) {
  const t = useTranslate('editor');
  const [draft, setDraft] = useState('');
  const mode = titleFilter?.mode ?? 'exclude';
  const terms = titleFilter?.terms ?? [];

  function commit(nextTerms: string[], nextMode: 'include' | 'exclude' = mode) {
    // Only collapse to `undefined` when there's truly nothing to remember —
    // an explicit mode pick with no terms yet must survive so the select
    // doesn't silently snap back to 'exclude' before the first term lands.
    onChange(nextTerms.length === 0 && nextMode === 'exclude' ? undefined : { mode: nextMode, terms: nextTerms });
  }

  function addDraftTerm() {
    const term = draft.trim();
    setDraft('');
    if (!term || terms.includes(term)) return;
    commit([...terms, term]);
  }

  function removeTerm(term: string) {
    commit(terms.filter((existing) => existing !== term));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <LabeledSelect
        label={t(`${keyPrefix}.titleFilterMode`)}
        value={mode}
        onChange={(v) => commit(terms, v as 'include' | 'exclude')}
        options={[
          { value: 'exclude', label: t(`${keyPrefix}.titleFilterExclude`) },
          { value: 'include', label: t(`${keyPrefix}.titleFilterInclude`) },
        ]}
      />
      <span className="text-xs text-hs-text-muted">{t(`${keyPrefix}.titleFilterTerms`)}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-hs-card border border-hs-border-strong px-2 py-1.5">
        {terms.map((term) => (
          <span
            key={term}
            className="flex items-center gap-1 rounded-full bg-hs-hover px-2 py-0.5 text-xs text-hs-text-body"
          >
            {term}
            <button
              type="button"
              onClick={() => removeTerm(term)}
              className="text-hs-text-muted hover:text-hs-text-body"
              aria-label={t(`${keyPrefix}.titleFilterRemoveTerm`, { term })}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addDraftTerm();
            } else if (e.key === 'Backspace' && draft === '' && terms.length > 0) {
              removeTerm(terms[terms.length - 1]);
            }
          }}
          onBlur={addDraftTerm}
          placeholder={t(`${keyPrefix}.titleFilterTermsPlaceholder`)}
          className="flex-1 min-w-20 bg-transparent text-xs text-hs-text-body outline-none placeholder:text-hs-text-faint"
        />
      </div>
    </div>
  );
}
