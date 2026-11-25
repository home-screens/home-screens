'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import StatusDot from '@/components/ui/StatusDot';
import { STATUS_PILL_TONE_CLASS } from '@/components/ui/StatusPill';

interface Props {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  statusLabel: string;
  /**
   * `own`: working, on something the household set up itself (Google's
   * own-app pill). `attention`: set up, but not working right now (a sign-in
   * that lapsed, a server that isn't answering).
   */
  statusType: 'connected' | 'partial' | 'none' | 'own' | 'attention';
  defaultOpen?: boolean;
  /** Optional settings-search anchor, rendered as `data-field-id` on the card's outer wrapper. */
  fieldId?: string;
  children: React.ReactNode;
}

export default function IntegrationCard({
  icon,
  iconBg,
  name,
  description,
  statusLabel,
  statusType,
  defaultOpen,
  fieldId,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const tone =
    statusType === 'none'
      ? 'neutral'
      : statusType === 'partial' || statusType === 'attention'
        ? 'warning'
        : statusType === 'own'
          ? 'info'
          : 'success';

  return (
    <div
      className="mb-2.5 border border-hs-border-strong/80 rounded-[10px] bg-hs-card/60 overflow-hidden hover:border-hs-text-faint transition-colors"
      data-field-id={fieldId}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer select-none text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: iconBg }}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-hs-text-body">{name}</div>
            <div className="text-xs text-hs-text-faint">{description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-3">
          {/* A status pill that shrinks to its dot below lg, so it keeps its
              own shape and takes only the shared tone colours. */}
          <span className={`inline-flex items-center gap-1.5 p-1.5 lg:px-2.5 lg:py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${STATUS_PILL_TONE_CLASS[tone]}`}>
            <StatusDot tone={tone} />
            <span className="hidden lg:inline">{statusLabel}</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-hs-text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-hs-border-strong/60 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
