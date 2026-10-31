import { useEffect, useState } from 'react';

/**
 * Gives focus back to what had it when a popover opened (the cell or the
 * button that opened it) once the popover closes, so the keyboard carries on
 * from there instead of from the top of the page. Only when focus would
 * otherwise be lost: a click that closed the popover by landing on something
 * else leaves focus there.
 *
 * What had focus is read on the first render, before the popover's own
 * effects move focus into it.
 */
export function useReturnFocus(): void {
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => () => {
    const now = document.activeElement;
    if (opener instanceof HTMLElement && opener.isConnected && (!now || now === document.body)) {
      opener.focus({ preventScroll: true });
    }
  }, [opener]);
}
