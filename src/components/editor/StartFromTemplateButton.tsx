'use client';

import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import Button from '@/components/ui/Button';
import TemplateFlow from './TemplateFlow';

/**
 * "Choose a template" button in front of the shared TemplateFlow. Used from
 * the empty-canvas placeholder and the first-run checklist, so a new user
 * reaches the template catalog from the two places they are actually
 * looking instead of the "+ ˅ > From Template…" menu between the screen tabs.
 *
 * `replaceEmptyScreenId` is the screen the user is standing on: when it is
 * still empty once the template lands it is dropped in the same edit, so
 * picking Family Dashboard on a fresh install yields one finished screen,
 * not a finished screen plus the blank "Screen 1" it started from.
 */
export default function StartFromTemplateButton({
  replaceEmptyScreenId,
  label,
  size = 'md',
  variant = 'primary',
  className,
}: {
  replaceEmptyScreenId?: string;
  label: string;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <LayoutTemplate className="w-4 h-4" />
        {label}
      </Button>
      <TemplateFlow open={open} onClose={() => setOpen(false)} replaceEmptyScreenId={replaceEmptyScreenId} />
    </>
  );
}
