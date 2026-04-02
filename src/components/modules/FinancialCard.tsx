import { TEXT_OPACITY } from '@/lib/constants';
import { ContentCard } from './shared/ContentCard';

interface FinancialCardProps {
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
  scale: number;
}

export default function FinancialCard({ label, price, changeValue, changeLabel, scale }: FinancialCardProps) {
  const positive = changeValue >= 0;

  return (
    <ContentCard
      className="flex flex-col items-center"
      style={{
        padding: `${0.75 * scale}em ${1 * scale}em`,
        gap: `${0.25 * scale}em`,
      }}
    >
      <span className="font-semibold tracking-wider" style={{ fontSize: `${0.75 * scale}em`, opacity: TEXT_OPACITY.secondary }}>{label}</span>
      <span className="font-bold whitespace-nowrap tabular-nums" style={{ fontSize: `${1.25 * scale}em` }}>${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className={`whitespace-nowrap tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: `${0.75 * scale}em` }}>
        {changeLabel}
      </span>
    </ContentCard>
  );
}
