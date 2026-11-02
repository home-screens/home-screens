'use client';

import { useCallback } from 'react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import {
  readRecipeWall,
  recipeWallTarget,
  targetWallName,
  useDisplayTarget,
  type DisplayTargetValue,
} from '../display-target';

/**
 * Where a send's outcome is said. The Meals tab passes its own notice and
 * error line, which sit over its sheets and above the Library's add button;
 * the remote's toast would be hidden under an open meal sheet.
 */
export interface WallNotices {
  /**
   * It worked: say so. A recipe that went up comes with `takeDown`, which the
   * notice offers as "Take it down".
   */
  sent: (message: string, takeDown?: () => void) => void;
  /** It did not go: say why. */
  failed: (message: string) => void;
}

export interface ShowRecipeOnWall {
  /**
   * Where a send goes right now (see `recipeWallTarget`), or null when this
   * phone has to ask which wall first.
   */
  wallForNow: () => DisplayTargetValue | null;
  /** The walls to ask between, by name. */
  walls: ReadonlyArray<{ id: string; name: string }>;
  /** Send the recipe to `wall`. Resolves true once the hub took it. */
  send: (meal: SavedMeal, wall: DisplayTargetValue) => Promise<boolean>;
}

/**
 * Send a meal's recipe to a wall, the way Photos sends a picture: the hub
 * opens it on the recipe card there. The outcome names where it went and
 * offers to take it down again, or says what went wrong: the recipe gone from
 * Mealie or the library, Mealie not answering, or the wall not reachable.
 */
export function useShowRecipeOnWall(notices: WallNotices): ShowRecipeOnWall {
  const t = useTranslate('remote');
  const { target, displays } = useDisplayTarget();
  const whereIs = useCallback(
    (wall: DisplayTargetValue) => targetWallName(wall, displays, { everyWall: t('mealsTab.showOnWall.everyWall'), theWall: t('mealsTab.showOnWall.theWall') }),
    [displays, t],
  );

  const takeDown = useCallback(async (meal: SavedMeal, wall: DisplayTargetValue) => {
    try {
      const res = await editorFetch('/api/display/hide-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId: meal.id, ...(wall ? { displayId: wall } : {}) }),
      });
      if (!res.ok) throw new Error(`hide-recipe answered ${res.status}`);
      notices.sent(t('mealsTab.showOnWall.takenDown', { meal: meal.name, where: whereIs(wall) }));
    } catch (err) {
      if (!isSessionExpired(err)) notices.failed(t('mealsTab.showOnWall.failed'));
    }
  }, [notices, t, whereIs]);

  const send = useCallback(async (meal: SavedMeal, wall: DisplayTargetValue) => {
    try {
      const res = await editorFetch('/api/display/show-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId: meal.id, ...(wall ? { displayId: wall } : {}) }),
      });
      if (res.status === 404) {
        notices.failed(t('mealsTab.showOnWall.gone'));
        return false;
      }
      if (!res.ok) {
        // The Mealie routes' refusals say `failure`: Mealie, not the wall, is the problem.
        const body = await res.json().catch(() => null) as { failure?: unknown } | null;
        notices.failed(t(body?.failure ? 'mealsTab.showOnWall.mealieFailed' : 'mealsTab.showOnWall.failed'));
        return false;
      }
      notices.sent(t('mealsTab.showOnWall.sent', { meal: meal.name, where: whereIs(wall) }), () => { void takeDown(meal, wall); });
      return true;
    } catch (err) {
      if (!isSessionExpired(err)) notices.failed(t('mealsTab.showOnWall.failed'));
      return false;
    }
  }, [t, notices, whereIs, takeDown]);

  const wallForNow = useCallback(() => recipeWallTarget(target, displays, readRecipeWall()), [target, displays]);

  return { wallForNow, walls: displays, send };
}
