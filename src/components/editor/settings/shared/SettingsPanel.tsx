import type { HTMLAttributes, ReactNode } from 'react';
import StatusPill from '@/components/ui/StatusPill';

/**
 * One part of a long settings page, drawn as its own panel: a title, a line
 * saying what it is for, and inside it the parts under the
 * `SettingsSectionHeading` every other page uses for sections. Panels sit on the page, and the
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
      {heading && <SettingsSectionHeading>{heading}</SettingsSectionHeading>}
      {children}
    </div>
  );
}

interface SettingsSectionHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
  /** Drawn on the heading's right, such as a small "Show" link. */
  trailing?: ReactNode;
}

/** The look of a Settings section heading, for a heading that lays out its own row (the Stats cards' icon row). */
export const SETTINGS_SECTION_HEADING_CLASS = 'text-sm font-medium uppercase tracking-wider text-hs-text-secondary';

/**
 * The one heading over a section of a Settings page: small uppercase words in
 * the secondary text colour. Every page, panel part and card group uses it,
 * so section headings read the same moving down the settings sidebar.
 */
export function SettingsSectionHeading({ children, trailing, className, ...rest }: SettingsSectionHeadingProps) {
  const heading = (
    <h3
      className={`${SETTINGS_SECTION_HEADING_CLASS}${trailing ? '' : ' mb-3'}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </h3>
  );
  if (!trailing) return heading;
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      {heading}
      {trailing}
    </div>
  );
}

/**
 * The heading one level under a `SettingsSectionHeading`: a group inside a
 * section, such as one kind of calendar source or one card of a form. It is
 * smaller and quieter than the section heading, so the two levels read
 * apart. It carries no margin; the caller adds the spacing its layout needs.
 */
export function SettingsSubHeading({ children, className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      className={`text-xs font-medium uppercase tracking-wider text-hs-text-muted${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </h4>
  );
}

/** "On" or "Off" beside a panel title, for a part that can be switched off. */
export function SettingsPanelState({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return <StatusPill tone={on ? 'success' : 'neutral'}>{on ? onLabel : offLabel}</StatusPill>;
}
