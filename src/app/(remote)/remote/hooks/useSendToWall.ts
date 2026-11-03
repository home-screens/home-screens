'use client';

import { useCallback } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { targetWallName, useDisplayTarget, type DisplayTargetValue } from '../display-target';

/** The two phrases `where` is built from, in the calling tab's own words. */
export interface WallWords {
  everyWall: string;
  theWall: string;
}

export type SendToWallResult =
  /** The hub took it; `where` names the wall it went to, for the notice. */
  | { ok: true; where: string }
  /**
   * It did not go. `status` is the hub's refusal, with `refusal` its JSON body
   * when it sent one; neither is set when the hub never answered. `expired`
   * means the session ran out and the page is already on its way to log in,
   * so there is nothing to tell.
   */
  | { ok: false; status?: number; refusal?: Record<string, unknown> | null; expired?: boolean };

export interface SendToWall {
  /**
   * POST `body` to one of the hub's display routes, addressed to `target`
   * the way the picker at the top of the remote means it: a display id, `all`
   * for every wall, or nothing on a single-display install.
   */
  send: (route: string, body: Record<string, unknown>, target: DisplayTargetValue, words: WallWords) => Promise<SendToWallResult>;
}

/**
 * Send something to a wall from the phone: a picture, a recipe. Adds the
 * target to the request, says where it went, and keeps a session that ran
 * out quiet. What to say about the outcome stays with the caller, since each
 * tab has its own wording.
 */
export function useSendToWall(): SendToWall {
  const { displays } = useDisplayTarget();

  const send = useCallback(async (route: string, body: Record<string, unknown>, target: DisplayTargetValue, words: WallWords): Promise<SendToWallResult> => {
    try {
      const res = await editorFetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...(target ? { displayId: target } : {}) }),
      });
      if (!res.ok) {
        const refusal = await res.json().catch(() => null) as Record<string, unknown> | null;
        return { ok: false, status: res.status, refusal };
      }
      return { ok: true, where: targetWallName(target, displays, words) };
    } catch (err) {
      return isSessionExpired(err) ? { ok: false, expired: true } : { ok: false };
    }
  }, [displays]);

  return { send };
}
