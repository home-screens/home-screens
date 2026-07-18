'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  statusLabel: string;
  statusType: 'connected' | 'partial' | 'none';
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

  const pillClasses =
    statusType === 'none'
      ? 'bg-hs-card/30 text-hs-text-faint'
      : statusType === 'partial'
        ? 'bg-hs-warning/10 text-hs-warning'
        : 'bg-hs-success/10 text-hs-success';

  const dotClasses =
    statusType === 'none'
      ? 'bg-hs-card'
      : statusType === 'partial'
        ? 'bg-hs-warning'
        : 'bg-hs-success';

  return (
    <div
      className="mb-2.5 border border-hs-border-strong/80 rounded-[10px] bg-hs-card/60 overflow-hidden hover:border-hs-text-faint transition-colors"
      data-field-id={fieldId}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3.5 cursor-pointer select-none"
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
          <span className={`inline-flex items-center gap-1.5 p-1.5 lg:px-2.5 lg:py-0.5 rounded-full text-[11px] whitespace-nowrap ${pillClasses}`}>
            <span className={`w-2 h-2 lg:w-[5px] lg:h-[5px] rounded-full ${dotClasses}`} />
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
