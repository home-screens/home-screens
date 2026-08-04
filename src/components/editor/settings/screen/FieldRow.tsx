'use client';

import type { ReactNode } from 'react';

/* ─── Mockup-aligned field-row primitives ─────────────────────────────
 *
 * The mockup renders each row as `padding: 14px 16px; border-bottom: 1px
 * solid #262626;`. Extracted as small components so the rendering stays
 * consistent across rows without polluting a shared module — these
 * primitives are used only by the Screen page's cards and exist purely to
 * make their JSX readable. The plan calls for a "single rounded container
 * with border-b separated rows," so the bottom border is added by
 * `FieldRow` itself rather than by the parent container styling each child.
 */
export function FieldRow({ fieldId, children }: { fieldId?: string; children: ReactNode }) {
  return (
    <div data-field-id={fieldId} className="px-4 py-3.5 border-b border-hs-border last:border-b-0">{children}</div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs text-hs-text-muted mb-2">{children}</div>;
}

export function FieldHelp({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-hs-text-faint mt-1.5">{children}</p>;
}
