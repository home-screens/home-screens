import LabeledField from './LabeledField';
import { INPUT_CLASS } from './input-classes';

type InputType = 'text' | 'number' | 'datetime-local' | 'date' | 'time' | 'url' | 'email' | 'password' | 'search';

interface LabeledInputProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: InputType;
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  className?: string;
  fieldClassName?: string;
  /** For a field that saves once typing is done rather than per keystroke. */
  onBlur?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  /** The help line under the box (see `LabeledField`). */
  hint?: React.ReactNode;
  hintTestId?: string;
}

export default function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
  step,
  className,
  fieldClassName,
  onBlur,
  onPaste,
  hint,
  hintTestId,
}: LabeledInputProps) {
  return (
    <LabeledField label={label} className={fieldClassName} hint={hint} hintTestId={hintTestId}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onPaste={onPaste}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={className ?? INPUT_CLASS}
      />
    </LabeledField>
  );
}
