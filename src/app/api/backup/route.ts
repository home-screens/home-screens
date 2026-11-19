import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { readConfig } from '@/lib/config';
import { writeBackupState } from '@/lib/backup-state';
import { withAuth, parseJsonBody, getClientIP } from '@/lib/api-utils';
import { newerSchemaProblem, validateConfigForWrite } from '@/lib/config-validation';
import { planCredentialRestore } from '@/lib/backup-credentials';
import { planFamilyRestore } from '@/lib/family-import';
import { BACKUP_SECTIONS, type BackupContent } from '@/lib/backup-sections';
import { commitDataTransaction, withDataTransaction } from '@/lib/data-transaction';
import {
  decryptCredentials,
  BadPassphraseError,
  MalformedEnvelopeError,
} from '@/lib/backup-crypto';
import {
  isCredentialEnvelope,
  isEncryptedEnvelope,
  type CredentialApplyResult,
  type CredentialEnvelope,
  type CredentialPayload,
} from '@/lib/backup-credentials-types';
import { audit } from '@/lib/audit';
import { planCustomIconRestore, readCustomIcons, sweepCustomIconFiles, verifyCustomIconBackup } from '@/lib/custom-icon-data';
import { missingCustomIconIds } from '@/lib/custom-icon-usage';
import { inspectRestoreArchive, openArchiveEntry, readArchiveEntryText, stagedArchivePath, type ArchivePictureEntry } from '@/lib/backup-archive';
import { autoBackupPath } from '@/lib/auto-backup-files';
import { readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { buildBackupBundle } from '@/lib/backup-compose';
import { MAX_RESTORE_BYTES } from '@/lib/backup-limits';
import {
  RESTORE_FREE_SPACE_MARGIN,
  missingPictureCount,
  pictureEntryProblem,
  planPictureWrites,
  type PictureWrite,
} from '@/lib/backup-pictures';
import { safeLibraryPath, volumeSpace, walkLibrary, writeLibraryFileTemp } from '@/lib/library-files';
import { MAX_IMPORT_IMAGE_BYTES, MAX_VIDEO_BYTES, mediaKindOf } from '@/lib/media-formats';
import { removeThumbnails } from '@/lib/thumbnails';
import { bumpLibraryRevision } from '@/lib/library-revision';
import { enqueueCommand } from '@/lib/display-commands';
import { logger } from '@/lib/logger';

const log = logger('backup');
import type { ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

// GET: export a full backup bundle, one field per section in BACKUP_SECTIONS.
export const GET = withAuth(async () => {
  const bundle = await buildBackupBundle();

  // Write both fields directly to avoid a read-modify-write race with
  // concurrent dismiss POSTs.
  await writeBackupState({
    lastBackupDate: new Date().toISOString(),
    lastDismissedDate: null,
  }).catch(() => {});

  return NextResponse.json(bundle);
}, 'Failed to create backup');

// Fields a restore bundle may carry beyond its content sections.
// screens/settings let the legacy config-only format be recognized before it
// is written as a full ScreenConfiguration.
interface RestoreBundle extends BackupContent {
  _type?: unknown;
  /**
   * Transient: the password for an encrypted `credentials` section. Never
   * part of the bundle on disk: the editor adds it to the request body only,
   * and the handler strips it before anything else touches the object.
   */
  _passphrase?: unknown;
  /**
   * Transient: the id `POST /api/backup/upload` answered for a staged zip.
   * The bundle is read out of that archive and its pictures are written
   * around the data commit; the rest of the body is then only `_passphrase`
   * and `_withoutKeys`.
   */
  _archive?: unknown;
  /** Transient: drop the archive's `credentials` section (the client cannot strip it itself). */
  _withoutKeys?: unknown;
  /**
   * Transient: the name of an automatic backup kept on the hub, restored the
   * way a staged archive is but never removed afterwards.
   */
  _auto?: unknown;
  /** Transient: unlock an automatic backup's keys with the saved backup password. */
  _useSavedPassword?: unknown;
  credentials?: unknown;
  /**
   * Optional: the family's own icons, when the export left them in. Not a
   * content section: the pictures come as base64 and are checked and written
   * by the icon store itself, and `GET /api/backup/custom-icons` is where
   * they are exported from.
   */
  customIcons?: unknown;
  screens?: unknown;
  settings?: unknown;
}

// Restore is planned completely before publication. Content, credentials and
// any legacy folds share a durable journal; handled failures record rollback
// before restoring before-images, and a restart resumes the saved decision.

/**
 * A sentence for anything that prints `error` verbatim, plus the machine code
 * the editor maps to localized copy. Both, always: `error` alone reaches a
 * phone, and a code alone would show it the word `bad_passphrase`.
 */
const CREDENTIAL_ERRORS = {
  passphrase_required: 'This backup\'s saved keys are password protected. Enter the password to restore them.',
  bad_passphrase: 'That password does not match the one this backup was saved with.',
  invalid_credentials: 'The saved keys in this backup are damaged and cannot be read.',
} as const;

function credentialError(code: keyof typeof CREDENTIAL_ERRORS): NextResponse {
  return NextResponse.json({ error: CREDENTIAL_ERRORS[code], code }, { status: 400 });
}

/**
 * Turn the bundle's `credentials` field into a payload we can write, or into
 * the 400 the client needs to drive its passphrase prompt. Runs BEFORE any
 * disk write, so a wrong password costs nothing. `passphrase_required` is
 * what opens the password modal on the restore path.
 */
async function resolveCredentials(
  raw: unknown,
  passphrase: string | undefined,
): Promise<CredentialPayload | NextResponse> {
  if (!isCredentialEnvelope(raw)) {
    return credentialError('invalid_credentials');
  }
  const envelope = raw as CredentialEnvelope;
  if (!isEncryptedEnvelope(envelope)) return envelope.data;

  if (!passphrase) {
    return credentialError('passphrase_required');
  }
  try {
    return await decryptCredentials(envelope, passphrase);
  } catch (err) {
    if (err instanceof BadPassphraseError) {
      return credentialError('bad_passphrase');
    }
    if (err instanceof MalformedEnvelopeError) {
      return credentialError('invalid_credentials');
    }
    throw err;
  }
}

/** The pictures a restore put back, for the editor's and the phone's finished notice. */
interface PictureRestoreReport {
  added: number;
  replaced: number;
  kept: number;
  /** Zip entries that were not pictures of ours. */
  skipped: number;
  /** Written but not renamed into place; listed under Missing on the Media library page. */
  failed: number;
}

/** A staged archive's pictures, written under temporary names before the commit. */
interface StagedPictures {
  writes: PictureWrite[];
  temps: Map<string, string>;
  report: PictureRestoreReport;
}

/**
 * Write every added or replaced picture to a temporary name beside its
 * target, so the commit can rename them into place and a failed restore
 * leaves nothing behind. Answers a 400 (nothing written) when a picture
 * breaks a rule or the volume lacks the room.
 */
async function stagePictures(archive: string, entries: ArchivePictureEntry[], skipped: number): Promise<StagedPictures | NextResponse> {
  const existing = new Map<string, number>();
  for (const entry of entries) {
    const abs = safeLibraryPath(entry.libraryPath);
    if (!abs) continue;
    try { existing.set(entry.libraryPath, (await fs.stat(abs)).size); } catch { /* not there: an add */ }
  }
  const plan = planPictureWrites(entries, existing);
  const { freeBytes } = await volumeSpace();
  if (freeBytes !== undefined && plan.bytesNeeded > freeBytes - RESTORE_FREE_SPACE_MARGIN) {
    return NextResponse.json({ error: 'Not enough space on the hub for the pictures in this backup.' }, { status: 400 });
  }
  const byPath = new Map(entries.map((entry) => [entry.libraryPath, entry]));
  for (const write of plan.writes) {
    if (write.action === 'keep') continue;
    const entry = byPath.get(write.libraryPath)!;
    const problem = await pictureEntryProblem(write.libraryPath, write.bytes, () => readArchiveEntryText(archive, entry.entryName));
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const temps = new Map<string, string>();
  try {
    for (const write of plan.writes) {
      if (write.action === 'keep') continue;
      const entry = byPath.get(write.libraryPath)!;
      const target = safeLibraryPath(write.libraryPath)!;
      await fs.mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      const cap = mediaKindOf(write.libraryPath) === 'video' ? MAX_VIDEO_BYTES : MAX_IMPORT_IMAGE_BYTES;
      temps.set(write.libraryPath, await writeLibraryFileTemp(target, await openArchiveEntry(archive, entry.entryName), cap));
    }
  } catch (err) {
    await discardPictures(temps);
    throw err;
  }
  const report: PictureRestoreReport = {
    added: plan.writes.filter((w) => w.action === 'add').length,
    replaced: plan.writes.filter((w) => w.action === 'replace').length,
    kept: plan.writes.filter((w) => w.action === 'keep').length,
    skipped,
    failed: 0,
  };
  return { writes: plan.writes, temps, report };
}

async function discardPictures(temps: Map<string, string>): Promise<void> {
  await Promise.all([...temps.values()].map((tmp) => fs.rm(tmp, { force: true }).catch(() => {})));
}

/** After the commit: the temporary files take their names, and the walls hear about it. */
async function placePictures(staged: StagedPictures): Promise<void> {
  let replaced = 0;
  for (const write of staged.writes) {
    const tmp = staged.temps.get(write.libraryPath);
    if (!tmp) continue;
    try {
      await fs.rename(tmp, safeLibraryPath(write.libraryPath)!);
      if (write.action === 'replace') {
        replaced += 1;
        await removeThumbnails(write.libraryPath);
      }
    } catch (err) {
      staged.report.failed += 1;
      log.warn('Restored picture could not be placed', write.libraryPath, err);
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }
  if (staged.writes.some((w) => w.action !== 'keep')) bumpLibraryRevision();
  // The wall keeps a picture in an <img> that never re-requests an unchanged
  // URL, so a replaced file needs every display to start over.
  if (replaced > 0) enqueueCommand('all', 'reload');
}

/** Config references to pictures the library does not hold, once the restore has settled. */
async function countMissingPictures(): Promise<number> {
  try {
    const [config, library] = await Promise.all([readConfig(), walkLibrary()]);
    return missingPictureCount(config, library);
  } catch {
    return 0;
  }
}

// Everything up to the plan runs outside the data lock: the body can be
// 25 MB over a phone's Wi-Fi, and every display poll queues behind the lock
// while it is held. Validation and decryption read only the body, so no
// current source is consulted before the replacement has been checked; a good
// full backup must be able to repair corrupt files it replaces. Pending
// journals recover when the lock is taken for the plan and commit.
export const POST = withAuth(async (request: NextRequest) => {
  const posted = await parseJsonBody<RestoreBundle>(request, {
    maxBytes: MAX_RESTORE_BYTES,
  });
  if (posted instanceof NextResponse) return posted;

  // A zip, staged from a computer or kept on the hub: the bundle comes out of
  // the archive, the pictures with it. A staged zip is removed once the
  // restore is over, whatever the outcome; a kept copy never is.
  let source: { file: string; removeAfter: boolean } | null = null;
  if (posted._archive !== undefined) {
    const staged = stagedArchivePath(posted._archive);
    if (!staged) return NextResponse.json({ error: 'That backup is no longer on the hub. Pick the file again.' }, { status: 400 });
    source = { file: staged, removeAfter: true };
  } else if (posted._auto !== undefined) {
    const kept = autoBackupPath(posted._auto);
    if (!kept) return NextResponse.json({ error: 'That backup is no longer on the hub.' }, { status: 400 });
    source = { file: kept, removeAfter: false };
  }

  try {
    let body = posted;
    let pictureEntries: ArchivePictureEntry[] = [];
    let skippedEntries = 0;
    let archive: string | null = null;
    if (source) {
      const read = await readRestoreSource(source.file, source.removeAfter
        ? 'That backup is no longer on the hub. Pick the file again.'
        : 'That backup is no longer on the hub.');
      if (read instanceof NextResponse) return read;
      body = read.bundle;
      archive = read.archive;
      pictureEntries = read.pictures;
      skippedEntries = read.skipped;
      if (posted._passphrase !== undefined) body._passphrase = posted._passphrase;
      // The password saved for automatic backups unlocks their keys without
      // ever leaving the hub.
      if (posted._auto !== undefined && posted._useSavedPassword === true) {
        const { backupPassword } = await readAutoBackupSecrets();
        if (backupPassword) body._passphrase = backupPassword;
      }
      if (posted._withoutKeys === true) delete body.credentials;
    }
    return await restore(request, body, archive, pictureEntries, skippedEntries);
  } finally {
    if (source?.removeAfter) await fs.rm(source.file, { force: true }).catch(() => {});
  }
}, 'Failed to restore backup');

/**
 * The bundle of a backup file on the hub, and the pictures beside it when it
 * is a zip. A JSON copy is read whole under the same cap a posted one has.
 */
async function readRestoreSource(file: string, goneMessage: string): Promise<
  { bundle: RestoreBundle; archive: string | null; pictures: ArchivePictureEntry[]; skipped: number } | NextResponse
> {
  const gone = () => NextResponse.json({ error: goneMessage }, { status: 400 });
  const unrecognized = () => NextResponse.json({ error: 'Unrecognized backup format' }, { status: 400 });
  let text: string;
  let archive: string | null = null;
  let pictures: ArchivePictureEntry[] = [];
  let skipped = 0;
  if (file.endsWith('.zip')) {
    const inspected = await inspectRestoreArchive(file, MAX_RESTORE_BYTES);
    if (!inspected) return gone();
    text = inspected.bundleText;
    archive = file;
    pictures = inspected.pictures;
    skipped = inspected.skipped;
  } else {
    try {
      if ((await fs.stat(file)).size > MAX_RESTORE_BYTES) return unrecognized();
      text = await fs.readFile(file, 'utf8');
    } catch {
      return gone();
    }
  }
  let bundle: RestoreBundle;
  try {
    bundle = JSON.parse(text) as RestoreBundle;
  } catch {
    return unrecognized();
  }
  if (!bundle || typeof bundle !== 'object') return unrecognized();
  return { bundle, archive, pictures, skipped };
}

async function restore(
  request: NextRequest,
  body: RestoreBundle,
  archive: string | null,
  pictureEntries: ArchivePictureEntry[],
  skippedEntries: number,
): Promise<NextResponse> {
  // New bundle format
  if (body._type === 'home-screens-backup') {
    // Strip the transient passphrase before anything else reads the body, so
    // it can't be snapshotted, logged, or written to disk by accident.
    const passphrase = typeof body._passphrase === 'string' ? body._passphrase : undefined;
    delete body._passphrase;
    delete body._archive;
    delete body._withoutKeys;
    delete body._auto;
    delete body._useSavedPassword;

    // Every section is written whole, and a malformed one would break every
    // read after the restore, so each is held to the rule its own save
    // route applies.
    for (const section of BACKUP_SECTIONS) {
      if (body[section.key] === undefined) continue;
      const error = section.validate(body[section.key]);
      if (error) return NextResponse.json({ error }, { status: 400 });
    }

    // Decrypt before any write: a wrong password must cost nothing, and the
    // client's fallback is to re-post the same bundle with `credentials`
    // stripped, which restores everything except the keys.
    let credentialPayload: CredentialPayload | null = null;
    if (body.credentials !== undefined) {
      const resolved = await resolveCredentials(body.credentials, passphrase);
      if (resolved instanceof NextResponse) return resolved;
      credentialPayload = resolved;
    }

    // A bundle without the section leaves the library alone: a small backup
    // restored on the same device must not cost it its icons.
    const icons = body.customIcons === undefined ? null : await verifyCustomIconBackup(body.customIcons);
    if (typeof icons === 'string') return NextResponse.json({ error: icons }, { status: 400 });

    // The pictures land under temporary names before anything is committed,
    // so a restore that fails from here on leaves no new files behind.
    let staged: StagedPictures | null = null;
    if (archive && pictureEntries.length > 0) {
      const result = await stagePictures(archive, pictureEntries, skippedEntries);
      if (result instanceof NextResponse) return result;
      staged = result;
    }

    const clientIp = getClientIP(request);
    let credentialResult: CredentialApplyResult | null;
    try {
      credentialResult = await withDataTransaction(async () => {
        const planned = await planFamilyRestore(body);
        let result: CredentialApplyResult | null = null;
        if (credentialPayload) {
          const credentials = await planCredentialRestore(credentialPayload, clientIp);
          planned.changes.push(...credentials.changes);
          result = credentials.result;
        }
        if (icons) {
          const change = await planCustomIconRestore(icons);
          if (change) planned.changes.push(change);
        }
        await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
        return result;
      });
    } catch (err) {
      if (staged) await discardPictures(staged.temps);
      throw err;
    }
    if (staged) await placePictures(staged);
    if (credentialResult) audit({ action: 'credential_backup_restore', sections: credentialResult.applied.length, skipped: credentialResult.skipped });
    if (icons) await sweepCustomIconFiles().catch(() => {});
    // Restored meals, chores and screens that point at icons this device does
    // not have show a standard picture; the family is told why. Only a backup
    // made without its icons is to blame: one that carried them restores the
    // library it was made with, and anything else it points at had already
    // been removed on purpose.
    const missingIcons = icons ? 0 : missingCustomIconIds(
      BACKUP_SECTIONS.map((section) => body[section.key]),
      new Set((await readCustomIcons()).map((icon) => icon.id)),
    ).length;

    return NextResponse.json({
      restored: {
        ...Object.fromEntries(BACKUP_SECTIONS.map((section) => [section.key, body[section.key] !== undefined])),
        customIcons: !!icons,
      },
      missingIcons,
      // Screens, day rules and slideshows that point at library files this
      // hub does not hold, whether the backup was a JSON file (which never
      // carries pictures) or a zip that left some out. The Media library
      // page lists them.
      missingPictures: await countMissingPictures(),
      ...(staged ? { pictures: staged.report } : {}),
      // Present only when the bundle carried credentials. The editor needs
      // `applied` to know whether the session it is holding just died (auth),
      // and `skipped` to tell the user what the lockout guard held back.
      ...(credentialResult ? { credentials: credentialResult } : {}),
    });
  }

  // Legacy format: raw ScreenConfiguration object
  if (body.screens && Array.isArray(body.screens) && body.settings) {
    const err = validateConfigForWrite(body) ?? newerSchemaProblem(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await withDataTransaction(async () => {
      const planned = await planFamilyRestore({ config: body as unknown as ScreenConfiguration });
      await commitDataTransaction({ kind: 'backup-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true });
    });
    return NextResponse.json({ restored: { config: true }, missingPictures: await countMissingPictures() });
  }

  return NextResponse.json(
    { error: 'Unrecognized backup format' },
    { status: 400 },
  );
}
