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
  /** The help line under the select (see `LabeledField`). */
  hint?: React.ReactNode;
  hintTestId?: string;
}

export default function LabeledSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  fieldClassName,
  hint,
  hintTestId,
}: LabeledSelectProps<T>) {
  return (
    <LabeledField label={label} className={fieldClassName} hint={hint} hintTestId={hintTestId}>
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
