/**
 * Copy text to the clipboard, falling back to a hidden textarea.
 *
 * The fallback is load-bearing, not belt-and-braces: Home Screens is reached
 * over plain HTTP on the LAN, and `navigator.clipboard` only exists in a secure
 * context. On an `http://<pi>.local:3000` editor the modern API is simply
 * missing, so a bare `navigator.clipboard.writeText` throws and the button
 * silently does nothing.
 *
 * Returns whether the text made it to the clipboard, so callers can show a
 * "copied" state only when it actually happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through — permissions policy or an insecure context.
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
