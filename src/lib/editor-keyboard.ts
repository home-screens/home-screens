/**
 * Shared guards for the editor's window-level keyboard shortcuts, so every
 * hook agrees on when to stay out of the way.
 */

/** True when the key event came from a field the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/** True while any dialog or modal overlay is mounted. */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;
}

/** True while a context menu is open. A menu owns Escape (and the arrow
 *  keys) for as long as it is up, so the canvas must not also act on them. */
export function isMenuOpen(): boolean {
  return document.querySelector('[role="menu"]') !== null;
}
