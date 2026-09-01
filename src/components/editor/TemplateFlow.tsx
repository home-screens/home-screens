'use client';

import { useState } from 'react';
import type { LayoutExport } from '@/types/layout-export';
import TemplatePicker from './TemplatePicker';
import LayoutImportModal from './LayoutImportModal';

/**
 * The one start-from-template flow: the catalog, then the import
 * confirmation. Every entry point (the empty-canvas placeholder, the
 * first-run checklist, the screen tabs' "From Template…", Settings > Backups
 * & data) renders this rather than wiring the two modals itself, so they all
 * behave the same — including replacing the empty screen the user is
 * standing on instead of leaving it blank beside the imported one.
 *
 * `open` shows the catalog; `onClose` fires when the flow ends, whether by
 * dismissal or after a successful import.
 */
export default function TemplateFlow({
  open,
  onClose,
  replaceEmptyScreenId,
}: {
  open: boolean;
  onClose: () => void;
  replaceEmptyScreenId?: string;
}) {
  const [layout, setLayout] = useState<LayoutExport | null>(null);

  if (!open) return null;
  if (layout) {
    return (
      <LayoutImportModal
        layout={layout}
        replaceEmptyScreenId={replaceEmptyScreenId}
        onClose={() => {
          setLayout(null);
          onClose();
        }}
      />
    );
  }
  return <TemplatePicker onSelect={setLayout} onClose={onClose} />;
}
