import { TEXT_OPACITY } from '@/lib/constants';

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
    <div
      className="flex flex-col items-center rounded-lg"
      style={{
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: `${0.75 * scale}em ${1 * scale}em`,
        gap: `${0.25 * scale}em`,
      }}
    >
      <span className="font-semibold tracking-wider" style={{ fontSize: `${0.75 * scale}em`, opacity: TEXT_OPACITY.secondary }}>{label}</span>
      <span className="font-bold whitespace-nowrap" style={{ fontSize: `${1.25 * scale}em` }}>${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className={`whitespace-nowrap ${positive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: `${0.75 * scale}em` }}>
        {changeLabel}
      </span>
    </div>
  );
}
