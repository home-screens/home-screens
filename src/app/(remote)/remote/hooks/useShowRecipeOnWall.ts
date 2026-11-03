'use client';

import { useCallback, useMemo } from 'react';
import type { SavedMeal } from '@/types/config';
import { useTranslate } from '@/i18n';
import {
  readRecipeWall,
  recipeWallTarget,
  useDisplayTarget,
  type DisplayTargetValue,
} from '../display-target';
import { useSendToWall } from './useSendToWall';

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
  const { send: sendToWall } = useSendToWall();
  const words = useMemo(
    () => ({ everyWall: t('mealsTab.showOnWall.everyWall'), theWall: t('mealsTab.showOnWall.theWall') }),
    [t],
  );

  const takeDown = useCallback(async (meal: SavedMeal, wall: DisplayTargetValue) => {
    const result = await sendToWall('/api/display/hide-recipe', { mealId: meal.id }, wall, words);
    if (result.ok) notices.sent(t('mealsTab.showOnWall.takenDown', { meal: meal.name, where: result.where }));
    else if (!result.expired) notices.failed(t('mealsTab.showOnWall.failed'));
  }, [notices, t, sendToWall, words]);

  const send = useCallback(async (meal: SavedMeal, wall: DisplayTargetValue) => {
    const result = await sendToWall('/api/display/show-recipe', { mealId: meal.id }, wall, words);
    if (result.ok) {
      notices.sent(t('mealsTab.showOnWall.sent', { meal: meal.name, where: result.where }), () => { void takeDown(meal, wall); });
      return true;
    }
    if (result.status === 404) notices.failed(t('mealsTab.showOnWall.gone'));
    // The Mealie routes' refusals say `failure`: Mealie, not the wall, is the problem.
    else if (!result.expired) notices.failed(t(result.refusal?.failure ? 'mealsTab.showOnWall.mealieFailed' : 'mealsTab.showOnWall.failed'));
    return false;
  }, [t, notices, sendToWall, takeDown, words]);

  const wallForNow = useCallback(() => recipeWallTarget(target, displays, readRecipeWall()), [target, displays]);

  return { wallForNow, walls: displays, send };
}
