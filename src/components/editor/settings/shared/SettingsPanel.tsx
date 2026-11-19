import type { HTMLAttributes, ReactNode } from 'react';

/**
 * One part of a long settings page, drawn as its own panel: a title, a line
 * saying what it is for, and inside it the parts under the small uppercase
 * headings the other pages use for sections. Panels sit on the page, and the
 * rows inside them stay on cards: page, panel, card is the theme's own order
 * from darkest to lightest (see `globals.css`), so it reads the same in light.
 *
 * The panel title is an `h2` (the page title is the `h1`) and each part's
 * heading an `h3`. Parts are split by a thin line; a part with no heading
 * leads straight on from the title.
 */
interface SettingsPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Shown beside the title, such as whether the part is switched on. */
  badge?: ReactNode;
  children: ReactNode;
}

export function SettingsPanel({ title, description, badge, children, className, ...rest }: SettingsPanelProps) {
  return (
    <section className={`rounded-xl border border-hs-border bg-hs-panel px-5 pt-4 pb-5${className ? ` ${className}` : ''}`} {...rest}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-hs-text-primary">
        {title}
        {badge}
      </h2>
      {description && <p className="mt-0.5 text-xs text-hs-text-muted">{description}</p>}
      <div className="mt-4 [&>*+*]:mt-4 [&>*+*]:border-t [&>*+*]:border-hs-border-subtle [&>*+*]:pt-4">{children}</div>
    </section>
  );
}

interface SettingsPanelPartProps extends HTMLAttributes<HTMLDivElement> {
  heading?: ReactNode;
  children: ReactNode;
}

export function SettingsPanelPart({ heading, children, ...rest }: SettingsPanelPartProps) {
  return (
    <div {...rest}>
      {heading && <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wider text-hs-text-secondary">{heading}</h3>}
      {children}
    </div>
  );
}

/** "On" or "Off" beside a panel title, for a part that can be switched off. */
export function SettingsPanelState({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={`rounded-full border px-2 text-[10.5px] font-medium leading-[18px] ${
        on ? 'border-hs-success/30 bg-hs-success/10 text-hs-success' : 'border-hs-border-strong text-hs-text-muted'
      }`}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}
