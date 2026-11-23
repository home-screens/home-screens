'use client';

import { useTranslate, useFormattingLocale } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { describeModuleStatus, type ModuleStatusTone } from '@/lib/module-status';
import { useStateKeyLabel } from '@/hooks/useStateKeyLabel';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import type { SharedStateSource } from '@/hooks/useEditorSharedState';
import type { ModuleInstance } from '@/types/config';
import type { ScheduleClock } from '@/lib/schedule';
import StatusPill from '@/components/ui/StatusPill';
import type { StatusTone } from '@/components/ui/StatusDot';
import FieldHint from '@/components/ui/FieldHint';

/** A module's status in the shared pill tones: hidden is a problem, waiting needs a look. */
const CHIP_TONE: Record<ModuleStatusTone, StatusTone> = {
  off: 'danger',
  waiting: 'warning',
  active: 'info',
  background: 'neutral',
};

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
  now: ScheduleClock;
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
  const keyLabel = useStateKeyLabel();
  const statuses = describeModuleStatus(mod, {
    t,
    now,
    formattingLocale,
    timeFormat,
    verdictStates,
    source,
    keyLabel,
  });
  if (statuses.length === 0) return null;
  const shown = compact ? statuses.slice(0, 1) : statuses;

  return (
    <div className={compact ? 'flex gap-1' : 'space-y-1.5'} data-testid="module-status-chips">
      {shown.map((status) => (
        // min-w-0 lets a long label shorten with an ellipsis inside the
        // canvas row instead of running past the selected module.
        <div key={status.key} className="min-w-0">
          {/* On the canvas the chip sits on the module's own picture, so it
              gets a solid panel-coloured backing to read over anything. */}
          <span className={`inline-flex max-w-full rounded-full${compact ? ' bg-hs-panel' : ''}`}>
            <StatusPill tone={CHIP_TONE[status.tone]} size={compact ? 'sm' : 'md'} icon={status.icon} className="max-w-full">
              <span className="min-w-0 truncate">{status.label}</span>
            </StatusPill>
          </span>
          {withDetail && (
            <FieldHint className="mt-1">{status.detail}</FieldHint>
          )}
        </div>
      ))}
    </div>
  );
}
