'use client';

import { useTranslate, useFormattingLocale } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { describeModuleStatus, STATUS_CHIP_CLASS } from '@/lib/module-status';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { SharedStateSource } from '@/hooks/useEditorSharedState';
import type { ModuleInstance } from '@/types/config';

/**
 * The readable version of the canvas's corner badges: "Hidden",
 * "Mon to Fri, 7:00 AM to 9:00 AM", "Waiting for kitchen_motion". A 10px icon
 * whose meaning lives in a `title` tooltip cannot be read at a glance, and
 * amber means two different things (scheduled-and-off, condition-not-met),
 * so the selected module and the property panel spell it out.
 */
export default function ModuleStatusChips({
  mod,
  now,
  verdictStates,
  source,
  withDetail = false,
  compact = false,
}: {
  mod: ModuleInstance;
  now: Date;
  verdictStates?: ReadonlyMap<string, SharedStateEntry> | null;
  source?: SharedStateSource | null;
  /** Property panel: add the sentence explaining why. */
  withDetail?: boolean;
  /** Canvas: smaller type, no wrapping. */
  compact?: boolean;
}) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timeFormat = useEditorStore((s) => s.config?.settings.timeFormat);
  const statuses = describeModuleStatus(mod, {
    t,
    now,
    formattingLocale,
    timeFormat,
    verdictStates,
    source,
  });
  if (statuses.length === 0) return null;
  const shown = compact ? statuses.slice(0, 1) : statuses;

  return (
    <div className={compact ? 'flex gap-1' : 'space-y-1.5'} data-testid="module-status-chips">
      {shown.map((status) => (
        <div key={status.key}>
          <span
            className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 ${
              compact ? 'text-[10px]' : 'text-[11px]'
            } ${STATUS_CHIP_CLASS[status.tone]}`}
          >
            <status.icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{status.label}</span>
          </span>
          {withDetail && (
            <p className="mt-1 text-[11px] leading-relaxed text-hs-text-faint">{status.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}
