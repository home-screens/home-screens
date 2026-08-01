/**
 * Update the editor URL search params in place. Pass a string to set, null
 * to delete, undefined to leave a key unchanged. No-op on the server. Used
 * by every selection/CRUD/history action that the user expects to be able
 * to refresh without losing context.
 */
export function syncEditorUrl({ screen, display }: { screen?: string | null; display?: string | null }): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (screen !== undefined) {
    if (screen !== null) url.searchParams.set('screen', screen);
    else url.searchParams.delete('screen');
  }
  if (display !== undefined) {
    if (display !== null) url.searchParams.set('display', display);
    else url.searchParams.delete('display');
  }
  window.history.replaceState(null, '', url.toString());
}
