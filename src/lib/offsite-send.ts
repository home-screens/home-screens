/**
 * The one door to the storage folder, whichever kind it is. The run, the
 * retry and "Check it works" call these and never a kind's own file, so a
 * third kind would be one more branch here and nothing else.
 */
import type { StorageDestination } from './storage-destination';
import type { OffsiteOutcome } from './auto-backup-state';
import * as webdav from './webdav-upload';
import * as smb from './smb-upload';

/** A check's answer. A network share whose name was wrong also lists the shares the storage has. */
export type OffsiteCheck = OffsiteOutcome & { shares?: string[] };

export function sendToDestination(dest: StorageDestination, file: string, name: string): Promise<OffsiteOutcome> {
  return dest.kind === 'smb' ? smb.uploadFile(dest, file, name) : webdav.uploadFile(dest, file, name);
}

export function removeFromDestination(dest: StorageDestination, name: string): Promise<OffsiteOutcome> {
  return dest.kind === 'smb' ? smb.deleteFile(dest, name) : webdav.deleteFile(dest, name);
}

export function checkDestination(dest: StorageDestination): Promise<OffsiteCheck> {
  return dest.kind === 'smb' ? smb.testDestination(dest) : webdav.testDestination(dest);
}
