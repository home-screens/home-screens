import LabeledField from './LabeledField';
import { INPUT_CLASS } from './input-classes';

export interface LabeledSelectOption<T extends string> {
  value: T;
  label: string;
}

interface LabeledSelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<LabeledSelectOption<T>>;
  className?: string;
  fieldClassName?: string;
}

export default function LabeledSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  fieldClassName,
}: LabeledSelectProps<T>) {
  return (
    <LabeledField label={label} className={fieldClassName}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={className ?? INPUT_CLASS}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </LabeledField>
  );
}
