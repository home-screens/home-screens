'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale } from '@/i18n';
import { ContentCard } from './shared/ContentCard';
import { Sparkline } from './financial/shared';

interface FinancialCardProps {
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
  scale: number;
  sparkline?: number[];
}

export default function FinancialCard({ label, price, changeValue, changeLabel, scale, sparkline }: FinancialCardProps) {
  const positive = changeValue >= 0;
  const locale = useFormattingLocale();

  return (
    <ContentCard
      className="flex flex-col items-center justify-center"
      style={{
        padding: `${0.75 * scale}em ${1 * scale}em`,
        gap: `${0.25 * scale}em`,
      }}
    >
      <span className="font-semibold tracking-wider" style={{ fontSize: `${0.75 * scale}em`, opacity: TEXT_OPACITY.secondary }}>{label}</span>
      <span className="font-bold whitespace-nowrap tabular-nums" style={{ fontSize: `${1.25 * scale}em` }}>${price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className={`whitespace-nowrap tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: `${0.75 * scale}em` }}>
        {changeLabel}
      </span>
      {sparkline && <Sparkline points={sparkline} positive={positive} scale={scale} />}
    </ContentCard>
  );
}
