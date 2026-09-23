'use client';

import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { useTranslate } from '@/i18n';
import CustomIconsOverlay from './CustomIconsOverlay';

/**
 * A pointer to Your icons from the Photos tab. "You can use your own
 * pictures now" sends people to Photos first, which is about the slideshow
 * and never mentioned icons, so it read as a dead end.
 */
export default function YourIconsPrompt() {
  const t = useTranslate('core');
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-hs-border bg-hs-panel px-4 py-3">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-hs-warning/[0.12] text-hs-warning">
          <ImagePlus size={18} />
        </div>
        <div className="flex-1 min-w-0 text-sm text-hs-text-body">{t('customIcons.photosPrompt')}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 min-h-[44px] px-3 rounded-lg bg-hs-card text-sm font-semibold text-hs-text-primary active:opacity-70"
        >
          {t('customIcons.photosButton')}
        </button>
      </div>
      {open && <CustomIconsOverlay onBack={() => setOpen(false)} />}
    </>
  );
}
