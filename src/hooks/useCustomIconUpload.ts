'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isSessionExpired } from '@/lib/editor-fetch';
import type { CustomIconEntry, CustomIconErrorCode } from '@/lib/custom-icons';
import { iconNameFromFileName, normalizeIconName } from '@/lib/custom-icons';
import {
  CustomIconRequestError,
  cropCustomIcon,
  deleteCustomIcon,
  keepCustomIcon,
  renameCustomIcon,
  uploadCustomIcon,
} from './useCustomIcons';

export type CustomIconUploadState =
  | { step: 'idle' }
  | { step: 'uploading' }
  /** `existing`: the library already had this picture, as `icon`. */
  | { step: 'review'; icon: CustomIconEntry; name: string; existing: boolean }
  | { step: 'saving'; icon: CustomIconEntry; name: string; existing: boolean }
  | { step: 'error'; code: CustomIconErrorCode | 'failed' };

/** How long taps are swallowed after "Use this icon". */
export const TAP_SHIELD_MS = 350;

/**
 * Swallow taps for a moment. "Use this icon" closes its sheet at once, and
 * the second tap of a double tap then landed on whatever was underneath: the
 * meal form's Save Changes (which saved and closed the meal), or an emoji
 * tile (which swapped the new picture straight back out). The shield sits on
 * the page itself, not in the sheet, because a picker that closes on pick
 * takes the sheet with it.
 */
function shieldTaps(ms: number): void {
  if (typeof document === 'undefined') return;
  const shield = document.createElement('div');
  shield.setAttribute('aria-hidden', 'true');
  shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;touch-action:none';
  document.body.appendChild(shield);
  setTimeout(() => shield.remove(), ms);
}

interface UploadOptions {
  /** A name to start from, like the meal or chore the picker belongs to.
   *  Phones name photos "IMG_4821", which means nothing on a tile. */
  suggestedName?: string;
}

/**
 * The add-your-own-icon flow every picker shares; each surface draws it in
 * its own markup (a phone sheet, an editor panel).
 *
 * Picking a file uploads it straight away: the server shrinks and trims it,
 * and what comes back is what the review step previews at real sizes. The
 * upload is pending until "Use this icon" keeps it, so it shows in no list
 * and a review abandoned any way at all (a closed tab included) leaves
 * nothing behind: the server clears pending uploads nobody kept. Inside the
 * page the hook also removes its pending upload as soon as the review is
 * given up (pick another, cancel, or the picker unmounting), including an
 * upload that finishes after the picker has gone.
 *
 * A picture the library already has comes back as that icon, and keeping it
 * just picks it.
 */
export function useCustomIconUpload(onUse: (icon: CustomIconEntry) => void, options: UploadOptions = {}) {
  const [state, setState] = useState<CustomIconUploadState>({ step: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const onUseRef = useRef(onUse);
  onUseRef.current = onUse;
  const suggestedRef = useRef(options.suggestedName);
  suggestedRef.current = options.suggestedName;
  /** Saved but not yet kept: the icon to remove if the review is abandoned. */
  const pendingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  /** Bumped by every upload and every give-up, so an upload answering after
   *  the family cancelled (or picked another file) is dropped, not shown. */
  const seqRef = useRef(0);

  const discardPending = useCallback(() => {
    seqRef.current += 1;
    const id = pendingRef.current;
    pendingRef.current = null;
    if (id) void deleteCustomIcon(id).catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardPending();
    };
  }, [discardPending]);

  /** Open the system file picker. */
  const choose = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  }, []);

  const upload = useCallback(async (file: File) => {
    discardPending();
    const seq = seqRef.current;
    setState({ step: 'uploading' });
    try {
      const suggested = normalizeIconName(suggestedRef.current);
      const { icon, existing } = await uploadCustomIcon(file, suggested ?? iconNameFromFileName(file.name));
      if (!mountedRef.current || seq !== seqRef.current) {
        if (!existing) void deleteCustomIcon(icon.id).catch(() => {});
        return;
      }
      if (!existing) pendingRef.current = icon.id;
      setState({ step: 'review', icon, name: icon.name, existing });
    } catch (error) {
      if (isSessionExpired(error) || seq !== seqRef.current) return;
      setState({ step: 'error', code: error instanceof CustomIconRequestError ? error.code : 'failed' });
    }
  }, [discardPending]);

  /** Handler for the hidden `<input type="file">`. */
  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void upload(file);
  }, [upload]);

  const setName = useCallback((name: string) => {
    setState((current) => (current.step === 'review' ? { ...current, name } : current));
  }, []);

  const confirm = useCallback(async () => {
    if (state.step !== 'review') return;
    const { icon, existing } = state;
    const name = normalizeIconName(state.name) ?? icon.name;
    // From here the keep is in flight: the picture is no longer an abandoned
    // upload, so closing the picker now must not remove it. The keep can
    // commit on the hub before its answer arrives, and a removal racing it
    // would delete an icon the family just chose.
    pendingRef.current = null;
    const seq = seqRef.current;
    setState({ step: 'saving', icon, name, existing });
    try {
      let used = icon;
      if (!existing) used = await keepCustomIcon(icon.id, name);
      else if (name !== icon.name) used = await renameCustomIcon(icon.id, name);
      // The picker went away (or started over) while the keep was out: the
      // icon stays in the library, but nothing is picked behind anyone's back.
      if (!mountedRef.current || seq !== seqRef.current) return;
      shieldTaps(TAP_SHIELD_MS);
      setState({ step: 'idle' });
      onUseRef.current(used);
    } catch (error) {
      if (isSessionExpired(error)) return;
      // No removal here either: a lost answer may still have been a keep the
      // hub committed. A keep that truly failed leaves the upload pending,
      // and the hub clears pending uploads within the hour.
      if (!mountedRef.current || seq !== seqRef.current) return;
      setState({ step: 'error', code: error instanceof CustomIconRequestError ? error.code : 'failed' });
    }
  }, [state]);

  /** Cut a wide or tall new picture down to its centre square. */
  const crop = useCallback(async () => {
    if (state.step !== 'review' || state.existing) return;
    const { icon, name } = state;
    setState({ step: 'saving', icon, name, existing: false });
    try {
      const cropped = await cropCustomIcon(icon.id);
      if (mountedRef.current) setState({ step: 'review', icon: cropped, name, existing: false });
    } catch (error) {
      if (isSessionExpired(error) || !mountedRef.current) return;
      // Say why (a full library, say); the upload stays pending, so Cancel or
      // "Pick a different picture" still clears it.
      if (error instanceof CustomIconRequestError) setState({ step: 'error', code: error.code });
      else setState({ step: 'review', icon, name, existing: false });
    }
  }, [state]);

  /** Drop the picture under review (it was already saved) and pick again. */
  const pickAnother = useCallback(() => {
    // The picker opens first: iOS only shows it from inside the tap itself,
    // not after an await.
    choose();
    discardPending();
    setState({ step: 'idle' });
  }, [choose, discardPending]);

  /** Close without keeping anything. */
  const cancel = useCallback(() => {
    discardPending();
    setState({ step: 'idle' });
  }, [discardPending]);

  return { state, inputRef, choose, upload, onFileChange, setName, confirm, crop, pickAnother, cancel };
}
