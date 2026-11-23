import type { EventOwner } from '@/lib/calendar-people';
import { GlyphPrefix } from '@/components/ui/Glyph';
import { MemberBadge } from './MemberBadge';

/**
 * The marker in front of an event: the calendar's color dot, or, with name
 * tags on and an owner known, the owner's initials on their color. Both
 * calendar modules use it wherever they drew a dot, so the tag rule lives
 * in one place. A rule glyph is handled by the caller and wins over both.
 *
 * `size` is the dot diameter the caller used before; the tag is drawn at
 * `tagSize` (default twice the dot) so initials stay legible.
 */
export function EventMarker({ owner, color, size, tagSize, reserve, style, className }: {
  owner: EventOwner | undefined;
  color: string;
  size: number | string;
  tagSize?: number | string;
  /**
   * With tags on, an untagged row's dot sits centred in a tag-wide slot so
   * titles line up down the list whether or not a row has an owner.
   */
  reserve?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const diameter = tagSize ?? (typeof size === 'number' ? size * 2 : `calc(${size} * 2)`);
  if (!owner) {
    const dot = <span aria-hidden="true" data-event-marker="dot" className={reserve ? undefined : className} style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block', ...(reserve ? {} : style) }} />;
    if (!reserve) return dot;
    return <span aria-hidden="true" className={className} style={{ width: diameter, height: diameter, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>{dot}</span>;
  }
  return (
    <MemberBadge
      data-event-marker="tag"
      data-name-tag={owner.id}
      aria-label={owner.name}
      className={className}
      initials={owner.initials}
      color={owner.color}
      size={diameter}
      fontSize={typeof diameter === 'number' ? diameter * 0.46 : `calc(${diameter} * 0.46)`}
      style={{ letterSpacing: '0.01em', ...style }}
    />
  );
}

/**
 * Inline prefix for a block or bar title: a rule glyph when one is set,
 * otherwise the owner's tag when name tags are on, otherwise nothing. Sized
 * in em so it follows the title it sits in.
 */
export function TagPrefix({ glyph, owner, color }: { glyph: string | null | undefined; owner: EventOwner | undefined; color: string }) {
  if (glyph) return <GlyphPrefix value={glyph} />;
  if (!owner) return null;
  return <EventMarker owner={owner} color={color} size="0.5em" tagSize="1.6em" style={{ verticalAlign: 'middle', marginTop: '-0.15em', marginRight: '0.35em' }} />;
}
