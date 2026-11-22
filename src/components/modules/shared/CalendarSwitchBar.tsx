'use client';

import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { ink } from '@/lib/constants';
import type { WallPeopleChoices, WallPersonPick } from '@/lib/calendar-wall-switch';
import { FaceStack, PersonFace } from './WallPersonSheet';
import { wallPressProps } from './wallPress';

export interface SwitchBarView<V extends string> {
  value: V;
  label: string;
  icon: LucideIcon;
}

/**
 * Sizes: the full-screen calendar's are its wall units (`bu`, a hundredth of
 * the short side), the card's follow its type size like the look-ahead
 * arrows, never under a finger's 44 px.
 */
function sizes(look: 'fullscreen' | 'card', bu: number) {
  if (look === 'fullscreen') {
    return {
      bar: `${Math.max(56, bu * 7)}px`,
      button: `${Math.max(44, bu * 5)}px`,
      person: `${Math.max(46, bu * 5.75)}px`,
      face: `${Math.max(32, bu * 4.25)}px`,
      font: `${Math.max(14, bu * 1.95)}px`,
      icon: `${Math.max(16, bu * 2.05)}px`,
      pad: `${bu * 1.5}px`,
      gap: `${bu * 0.9}px`,
    };
  }
  return {
    bar: 'max(54px, 3.4em)',
    button: 'max(44px, 2.75em)',
    person: 'max(44px, 2.9em)',
    face: 'max(30px, 2.2em)',
    font: '0.9em',
    icon: '1.05em',
    pad: '0px',
    gap: '0.5em',
  };
}

function palette(look: 'fullscreen' | 'card') {
  return look === 'fullscreen'
    ? {
      track: 'var(--cal-surface-alt)',
      text: 'var(--cal-text-secondary)',
      onBg: 'var(--cal-surface)',
      onText: 'var(--cal-accent)',
      onShadow: '0 1px 3px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)',
      buttonBg: 'var(--cal-surface)',
      buttonBorder: 'var(--cal-border)',
      buttonText: 'var(--cal-text-primary)',
      muted: 'var(--cal-text-tertiary)',
      ring: 'var(--cal-surface)',
      clear: 'color-mix(in srgb, var(--cal-text-primary) 9%, transparent)',
    }
    : {
      track: ink(0.07),
      text: ink(0.62),
      onBg: ink(0.16),
      onText: ink(1),
      onShadow: 'none',
      buttonBg: ink(0.07),
      buttonBorder: ink(0.14),
      buttonText: ink(1),
      muted: ink(0.6),
      ring: 'rgba(0,0,0,0.6)',
      clear: ink(0.14),
    };
}

/**
 * The row of wall controls under a calendar's heading: the views the editor
 * offered on the left (the one on screen lit), the person button on the
 * right. Drawn only on a touch wall, and only with something to offer.
 */
export function CalendarSwitchBar<V extends string>({ look, bu = 10.8, views, current, onView, people, pick, pending, onOpenPeople, onClearPerson, style }: {
  look: 'fullscreen' | 'card';
  bu?: number;
  /** Two or more to draw the view buttons. */
  views: readonly SwitchBarView<V>[];
  current: V;
  onView: (view: V) => void;
  /** The picker's choices, or null when there is no person button. */
  people: WallPeopleChoices | null;
  pick: WallPersonPick | null;
  /** The roster is still on its way: the button shows but waits. */
  pending: boolean;
  onOpenPeople: () => void;
  onClearPerson: () => void;
  style?: CSSProperties;
}) {
  const t = useTranslate('modules');
  const s = sizes(look, bu);
  const c = palette(look);
  const picked = pick && people
    ? pick.kind === 'member'
      ? { person: people.people.find((p) => p.id === pick.id), group: undefined }
      : { person: undefined, group: people.groups.find((g) => g.id === pick.id) }
    : null;
  const pickedName = picked?.person?.name ?? picked?.group?.name ?? null;
  const tint = picked?.person?.color;

  return (
    <div
      data-testid="calendar-switch-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: s.gap,
        minHeight: s.bar,
        padding: `0 ${s.pad}`,
        flexShrink: 0,
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        ...style,
      }}
    >
      {views.length >= 2 ? (
        <div role="group" aria-label={t('calendar.wallSwitch.viewsLabel')} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: `calc(${s.button} * 0.33)`, background: c.track, minWidth: 0 }}>
          {views.map(({ value, label, icon: Icon }) => {
            const on = value === current;
            return (
              <button
                key={value}
                type="button"
                {...wallPressProps}
                data-wall-view={value}
                aria-pressed={on}
                onClick={() => onView(value)}
                style={{
                  height: s.button,
                  padding: `0 calc(${s.font} * 1.05)`,
                  borderRadius: `calc(${s.button} * 0.24)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: `calc(${s.font} * 0.45)`,
                  fontSize: s.font,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  background: on ? c.onBg : 'transparent',
                  color: on ? c.onText : c.text,
                  boxShadow: on ? c.onShadow : 'none',
                  cursor: 'pointer',
                }}
              >
                <Icon aria-hidden="true" strokeWidth={2} style={{ width: s.icon, height: s.icon, flexShrink: 0 }} />
                {label}
              </button>
            );
          })}
        </div>
      ) : <span />}
      {people && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: s.person,
            borderRadius: 999,
            background: tint ? `color-mix(in srgb, ${tint} 18%, transparent)` : c.buttonBg,
            border: `1px solid ${tint ?? c.buttonBorder}`,
            flexShrink: 0,
            opacity: pending ? 0.55 : 1,
          }}
        >
          <button
            type="button"
            {...wallPressProps}
            data-testid="calendar-person-button"
            data-picked={pick ? `${pick.kind}:${pick.id}` : undefined}
            aria-haspopup="dialog"
            disabled={pending}
            onClick={onOpenPeople}
            style={{
              height: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              gap: `calc(${s.font} * 0.55)`,
              padding: `0 ${pick ? `calc(${s.font} * 0.3)` : `calc(${s.font} * 0.9)`} 0 calc(${s.person} * 0.12)`,
              background: 'transparent',
              border: 'none',
              borderRadius: 999,
              color: c.buttonText,
              fontSize: s.font,
              fontWeight: 600,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {picked?.group
              ? <FaceStack people={picked.group.members} size={`calc(${s.face} * 0.86)`} ring={c.ring} />
              : <PersonFace person={picked?.person ?? null} size={s.face} />}
            {pickedName ?? t('fullscreen-calendar.everyone')}
            {!pick && <ChevronDown aria-hidden="true" strokeWidth={2.2} style={{ width: s.icon, height: s.icon, color: c.muted }} />}
          </button>
          {pick && (
            <button
              type="button"
              {...wallPressProps}
              data-testid="calendar-person-clear"
              aria-label={t('calendar.wallSwitch.showEveryone')}
              onClick={onClearPerson}
              style={{
                width: `max(36px, calc(${s.person} * 0.72))`,
                height: `max(36px, calc(${s.person} * 0.72))`,
                marginRight: `calc(${s.person} * 0.14)`,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: c.clear,
                color: c.buttonText,
                cursor: 'pointer',
              }}
            >
              <X aria-hidden="true" strokeWidth={2.6} style={{ width: s.icon, height: s.icon }} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
