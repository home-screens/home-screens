/**
 * Trigger a browser download of a Blob. The anchor must be in the document
 * and the object URL must outlive the click: Safari ignores clicks on
 * detached anchors and aborts in-flight downloads if the URL is revoked
 * too early, so the revoke is deferred. One helper so every export path
 * (backups, diagnostics, layouts) carries the same fix.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
