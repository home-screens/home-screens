'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Monitor, MonitorUp } from 'lucide-react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { rememberRecipeWall, type DisplayTargetValue } from '../display-target';
import { useShowRecipeOnWall, type WallNotices } from '../hooks/useShowRecipeOnWall';
import BottomSheet from './BottomSheet';
import { SheetRow } from './PhotoFolderSheets';

/** How long the button keeps its tick after the hub took the recipe. */
const SENT_MS = 2_000;

const IDLE: CSSProperties = { border: '1px solid var(--hs-border-strong)', background: 'var(--hs-bg-hover)', color: 'var(--hs-text-secondary)' };
const SENT: CSSProperties = { border: '1px solid rgba(245,158,11,0.6)', background: 'rgba(245,158,11,0.14)', color: '#f59e0b' };

interface RecipeWallButtonProps {
  meal: SavedMeal;
  /** Where the outcome is said (the Meals tab's notice and error line). */
  notices: WallNotices;
  variant?: 'icon' | 'wide';
  style?: CSSProperties;
}

/**
 * "Show on the wall" for one recipe: sends it to the wall picked at the top of
 * the remote, then shows a tick for a moment while the notice says where it
 * went and offers to take it down. With "All" picked in a home with two or
 * more walls it first asks which wall, once: the phone remembers the answer
 * for recipes. `icon` is the 44 px button on a Library card; `wide` is the
 * full-width button in the meal sheet, which says what it does in words.
 */
export default function RecipeWallButton({ meal, notices, variant = 'icon', style }: RecipeWallButtonProps) {
  const t = useTranslate('remote');
  const { wallForNow, walls, send } = useShowRecipeOnWall(notices);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const sendTo = async (wall: DisplayTargetValue) => {
    setState('sending');
    const ok = await send(meal, wall);
    if (!mounted.current) return;
    setState(ok ? 'sent' : 'idle');
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setState('idle'), SENT_MS);
  };

  const onClick = () => {
    if (state === 'sending') return;
    const wall = wallForNow();
    if (wall === null) setAsking(true);
    else void sendTo(wall);
  };

  const pickWall = (id: string) => {
    rememberRecipeWall(id);
    setAsking(false);
    void sendTo(id);
  };

  const sent = state === 'sent';
  const Icon = sent ? Check : MonitorUp;
  const wide = variant === 'wide';
  return (
    <>
    <button
      type="button"
      data-testid="recipe-wall-button"
      data-sent={sent ? 'true' : undefined}
      // The wide button's own words already say it; the meal is the sheet's.
      aria-label={wide ? undefined : t('mealsTab.showOnWall.ariaLabel', { meal: meal.name })}
      aria-busy={state === 'sending' || undefined}
      onClick={onClick}
      className="press-scale"
      style={{
        ...(sent ? SENT : IDLE),
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flex: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background-color 150ms, border-color 150ms, color 150ms',
        ...(wide
          ? { width: '100%', minHeight: 44, padding: '10px 14px', fontSize: 14, fontWeight: 600 }
          : { width: 44, height: 44, padding: 0 }),
        ...style,
      }}
    >
      <Icon size={wide ? 18 : 19} strokeWidth={2} aria-hidden />
      {wide && t('mealsTab.showOnWall.button')}
    </button>
    {/* On the page itself: the meal sheet this button can sit in is a
        dialog of its own, and a sheet inside it would be held to its box. */}
    {asking && createPortal(
      <BottomSheet title={t('mealsTab.showOnWall.pickTitle')} onClose={() => setAsking(false)} zIndex={210} testId="recipe-wall-picker">
        <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--hs-text-muted)', margin: '-6px 0 12px' }}>
          {t('mealsTab.showOnWall.pickHint')}
        </p>
        {walls.map((wall) => (
          <SheetRow key={wall.id} icon={<Monitor size={20} />} label={wall.name} onClick={() => pickWall(wall.id)} testId="recipe-wall-choice" />
        ))}
      </BottomSheet>,
      document.body,
    )}
    </>
  );
}
