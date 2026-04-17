'use client';

import type { ReactNode } from 'react';

export type PropertyGroupAccent = 1 | 2 | 3 | 4;

const ACCENT_CLASS: Record<PropertyGroupAccent, string> = {
  1: 'border-hs-group-accent-1',
  2: 'border-hs-group-accent-2',
  3: 'border-hs-group-accent-3',
  4: 'border-hs-group-accent-4',
};

interface PropertyGroupProps {
  title: string;
  accent?: PropertyGroupAccent;
  children: ReactNode;
}

export default function PropertyGroup({
  title,
  accent = 1,
  children,
}: PropertyGroupProps) {
  return (
    <div
      className="bg-hs-group-card-bg border border-hs-group-card-border rounded-md px-3 py-2.5 mb-2.5"
      style={{ boxShadow: 'var(--hs-group-card-shadow)' }}
    >
      <h4
        className={`inline-block pb-[3px] mb-[7px] text-[11px] font-semibold text-hs-group-title border-b-[1.5px] ${ACCENT_CLASS[accent]}`}
      >
        {title}
      </h4>
      <div>{children}</div>
    </div>
  );
}
