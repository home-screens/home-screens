'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Check, Users } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { EVERYONE_COLOR } from '@/lib/calendar-people';
import { memberInitials } from '@/lib/family-avatar';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { WallPeopleChoices, WallPersonPick } from '@/lib/calendar-wall-switch';
import type { CalendarPerson } from '@/types/config';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from './EventDetailOverlay';
import { daySheetLen as len } from './DaySheetOverlay';
import { WallOverlay, WallSheetPanel } from './WallOverlay';
import { wallPressProps } from './wallPress';

/** Most faces drawn on a group's tile; its count says the rest. */
const GROUP_FACES = 3;

/** A round face: a person's initial on their colour, or the family icon on gray. */
export function PersonFace({ person, size, ring }: { person: Pick<CalendarPerson, 'name' | 'color'> | null; size: string; ring?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: person ? person.color : EVERYONE_COLOR,
        color: '#fff',
        fontWeight: 700,
        fontSize: `calc(${size} * 0.44)`,
        lineHeight: 1,
        boxShadow: ring ? `0 0 0 calc(${size} * 0.06) ${ring}` : undefined,
      }}
    >
      {person ? memberInitials(person.name) : <Users strokeWidth={2.2} style={{ width: '54%', height: '54%' }} />}
    </span>
  );
}

/** Up to three faces overlapping, for a group. */
export function FaceStack({ people, size, ring }: { people: readonly Pick<CalendarPerson, 'id' | 'name' | 'color'>[]; size: string; ring: string }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0 }}>
      {people.slice(0, GROUP_FACES).map((person, i) => (
        <span key={person.id} style={{ marginLeft: i === 0 ? 0 : `calc(${size} * -0.34)`, display: 'inline-flex' }}>
          <PersonFace person={person} size={size} ring={ring} />
        </span>
      ))}
    </span>
  );
}

/**
 * "Whose calendar?": the sheet the person button opens, in the day sheet's
 * look. Everyone, then the family's groups, then each person who owns a
 * calendar, as big tiles two to a row so seven people fit without scrolling.
 * A tile picks and closes; Close (or nobody touching it) leaves it as it was.
 */
export function WallPersonSheet({ choices, current, counts, theme, accentColor, onPick, onClose }: {
  choices: WallPeopleChoices;
  current: WallPersonPick | null;
  /** Each person's events in what the view shows (`personEventCounts`). */
  counts: ReadonlyMap<string, number>;
  theme: FullscreenThemeTokens;
  accentColor: string;
  onPick: (pick: WallPersonPick | null) => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const tileBackground = theme.isDark
    ? `color-mix(in srgb, ${theme.text} 5%, ${theme.surface})`
    : `color-mix(in srgb, ${theme.surfaceAlt} 50%, ${theme.surface})`;
  const tileBorder = theme.isDark ? `color-mix(in srgb, ${theme.text} 10%, ${theme.surface})` : theme.borderSubtle;
  const onTile = `color-mix(in srgb, ${accentColor} ${theme.isDark ? 22 : 9}%, ${theme.surface})`;
  const face = len(62, 32);

  const tile = (key: string, testId: string, on: boolean, art: ReactNode, name: string, sub: string, pick: WallPersonPick | null, wide = false) => (
    <button
      key={key}
      type="button"
      {...wallPressProps}
      data-testid={testId}
      data-picked={on ? '' : undefined}
      aria-pressed={on}
      onClick={() => onPick(pick)}
      style={{
        gridColumn: wide ? 'span 2' : undefined,
        display: 'flex',
        alignItems: 'center',
        gap: len(18, 9),
        minHeight: len(108, 56),
        padding: `${len(12, 6)} ${len(20, 10)}`,
        borderRadius: len(22, 11),
        background: on ? onTile : tileBackground,
        border: on ? `3px solid ${accentColor}` : `1px solid ${tileBorder}`,
        color: theme.text,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      {art}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: len(31, 16), fontWeight: 650, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ display: 'block', fontSize: len(21, 11), color: theme.textMuted, marginTop: len(3, 2), whiteSpace: 'nowrap' }}>{sub}</span>
      </span>
      {on && (
        <span aria-hidden="true" style={{ width: len(44, 24), height: len(44, 24), borderRadius: '50%', background: accentColor, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Check strokeWidth={3} style={{ width: '56%', height: '56%' }} />
        </span>
      )}
    </button>
  );

  const body = (
    <div style={{ padding: `${len(36, 18)} ${len(56, 20)} ${len(44, 22)}`, borderTop: `12px solid ${accentColor}` }}>
      <div style={{ fontSize: len(22, 12), letterSpacing: '0.14em', textTransform: 'uppercase', color: theme.textMuted, marginBottom: len(10, 6) }}>
        {t('calendar.wallSwitch.sheetEyebrow')}
      </div>
      <div style={{
        fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
        fontSize: len(56, 26),
        lineHeight: 1.1,
        fontWeight: 400,
        color: theme.text,
        marginBottom: len(26, 14),
      }}>
        {t('calendar.wallSwitch.sheetTitle')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: len(14, 7) }}>
        {tile('everyone', 'wall-person-everyone', current === null, <PersonFace person={null} size={face} />,
          t('fullscreen-calendar.everyone'), t('calendar.wallSwitch.everyCalendar'), null, true)}
        {choices.groups.map((group) => tile(
          `g:${group.id}`, 'wall-person-group', current?.kind === 'group' && current.id === group.id,
          <FaceStack people={group.members} size={len(46, 24)} ring={tileBackground} />,
          group.name, t('calendar.wallSwitch.peopleCount', { count: group.members.length }), { kind: 'group', id: group.id },
        ))}
        {choices.people.map((person) => tile(
          `m:${person.id}`, 'wall-person-member', current?.kind === 'member' && current.id === person.id,
          <PersonFace person={person} size={face} />,
          person.name, t('calendar.daySheet.eventCount', { count: counts.get(person.id) ?? 0 }), { kind: 'member', id: person.id },
        ))}
      </div>
      <button
        type="button"
        {...wallPressProps}
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          marginTop: len(26, 14),
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          color: theme.text,
          fontSize: len(28, 15),
          fontWeight: 600,
          fontFamily: 'inherit',
          padding: `${len(22, 12)} 0`,
          borderRadius: 18,
          textAlign: 'center',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        {t('event-detail.close')}
      </button>
    </div>
  );

  return (
    <WallOverlay
      label={t('calendar.wallSwitch.sheetTitle')}
      onClose={onClose}
      autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS}
      testId="wall-person-sheet"
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', lineHeight: 1.5, '--ds-u': 'min(1vw, 0.7vh)' } as CSSProperties}
    >
      <WallSheetPanel variant="sheet" theme={theme}>
        {body}
      </WallSheetPanel>
    </WallOverlay>
  );
}
