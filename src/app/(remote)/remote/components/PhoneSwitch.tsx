'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import { switchKnobStyle, switchTrackStyle } from './remote-styles';

/**
 * The phone's on/off switch: a whole row that toggles, its words on the left
 * and the switch at the end, lit in the phone's one on colour. An event's
 * All day, a reward's Visible and the backup's icons all use it, so a switch
 * looks and answers the same on every page (`role="switch"`, `aria-checked`).
 *
 * `label` is what the row says; `ariaLabel` names the switch when that
 * changes with its state (a reward's "Visible" or "Hidden"). `style` frames
 * the row (a form field's box, extra spacing).
 */
export default function PhoneSwitch({
  checked,
  onChange,
  label,
  description,
  ariaLabel,
  disabled = false,
  testId,
  style,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  testId?: string;
  style?: CSSProperties;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : `${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: '100%',
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        background: 'none',
        border: 'none',
        color: 'inherit',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span id={`${id}-label`} style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--hs-text-primary)' }}>
          {label}
        </span>
        {description && (
          <span id={`${id}-description`} style={{ display: 'block', fontSize: 12, lineHeight: 1.4, color: 'var(--hs-text-muted)', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
      <span aria-hidden="true" style={switchTrackStyle(checked)}>
        <span style={switchKnobStyle(checked)} />
      </span>
    </button>
  );
}
