import LabeledField from './LabeledField';
import { INPUT_CLASS } from './input-classes';

interface LabeledTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  fieldClassName?: string;
  noResize?: boolean;
}

export default function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
  fieldClassName,
  noResize = true,
}: LabeledTextareaProps) {
  const base = className ?? INPUT_CLASS;
  const finalClassName = noResize ? `${base} resize-none` : base;
  return (
    <LabeledField label={label} className={fieldClassName}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={finalClassName}
      />
    </LabeledField>
  );
}
