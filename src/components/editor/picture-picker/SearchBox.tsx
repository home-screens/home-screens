'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

/** A search field for the bar above a grid. Search (or Enter) runs it; an idea in the sidebar clears it. */
export default function SearchBox({ value, placeholder, onSearch }: {
  value: string;
  placeholder: string;
  onSearch: (words: string) => void;
}) {
  const t = useTranslate('editor');
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // Picking an idea clears the box; follow it without an effect.
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const run = () => { if (draft.trim()) onSearch(draft.trim()); };
  return (
    <div className="flex flex-1 gap-1.5">
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-md border border-hs-border-strong bg-hs-card px-2 py-1 text-xs text-hs-text-body focus:border-hs-accent focus:outline-none"
        data-testid="picker-search"
      />
      <Button size="sm" onClick={run} disabled={!draft.trim()}>
        {t('photoSources.picker.search')}
      </Button>
    </div>
  );
}
