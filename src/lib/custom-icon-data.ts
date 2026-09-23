import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createJsonStore } from './json-store';
import { commitDataTransaction, getDataRoot, readTransactionFile, withDataTransaction, type TransactionChange } from './data-transaction';
import { ICON_REFERENCE_STORES, replaceIconReferences } from './custom-icon-removal';
import {
  ANIMATED_FALLBACK_EDGES,
  CUSTOM_ICON_HASH_RE,
  CUSTOM_ICON_ID_RE,
  ICON_EDGE_PX,
  LIBRARY_BUDGET_BYTES,
  MAX_ANIMATED_BYTES,
  MAX_FRAMES,
  MAX_ICONS,
  MAX_SOURCE_EDGE_PX,
  MAX_STILL_BYTES,
  MAX_UPLOAD_BYTES,
  PENDING_TTL_MS,
  customIconValue,
  libraryBytes,
  normalizeIconName,
  type CustomIcon,
  type CustomIconErrorCode,
  type CustomIconIndex,
} from './custom-icons';

/**
 * The household's own icons on disk.
 *
 * `data/custom-icons/index.json` lists them and goes through the data
 * transaction like every other family store, so a backup restore lands it
 * with the meals and chores that point at it. The pictures sit beside it as
 * `<hash>.webp`, named by their content: a file is written once, before the
 * index names it, and never changed. The transaction journal holds text, so
 * binary files stay out of it; an index rolled back or a failed write leaves
 * at most an unnamed file, which `sweepCustomIconFiles` removes.
 */

export const CUSTOM_ICON_DIR = 'data/custom-icons';
const INDEX_PATH = `${CUSTOM_ICON_DIR}/index.json`;

const store = createJsonStore<CustomIconIndex>({
  path: INDEX_PATH,
  defaultValue: { icons: [] },
  errorHandling: 'throw-corrupt',
});

export class CustomIconError extends Error {
  constructor(readonly code: CustomIconErrorCode, readonly status: number, message: string) {
    super(message);
    this.name = 'CustomIconError';
  }
}

const MESSAGES: Record<CustomIconErrorCode, string> = {
  'too-big': 'That picture is too big. Pick one under 5 MB.',
  'not-a-picture': 'Only pictures work here (PNG, JPG, WebP or GIF).',
  'svg-drawing': 'Drawings saved as SVG can\'t be used. Save it as a PNG first.',
  'picture-too-large': 'That picture is too large to use. Pick a smaller one.',
  'animation-too-big': 'That moving picture is too big. Try a shorter one.',
  'library-full': `You have ${MAX_ICONS} icons, which is the most you can keep. Remove one you don't use to make room.`,
  'budget-full': 'Your icons are using all of their space. Remove one you don\'t use to make room.',
  'bad-name': 'Give the icon a name.',
  'not-found': 'That icon is gone.',
};

const STATUS: Record<CustomIconErrorCode, number> = {
  'too-big': 413,
  'not-a-picture': 400,
  'svg-drawing': 400,
  'picture-too-large': 400,
  'animation-too-big': 413,
  'library-full': 409,
  'budget-full': 409,
  'bad-name': 400,
  'not-found': 404,
};

export function customIconError(code: CustomIconErrorCode): CustomIconError {
  return new CustomIconError(code, STATUS[code], MESSAGES[code]);
}

function iconDir(): string {
  return path.join(getDataRoot(), CUSTOM_ICON_DIR);
}

export function customIconFilePath(hash: string): string | null {
  if (!CUSTOM_ICON_HASH_RE.test(hash)) return null;
  return path.join(iconDir(), `${hash}.webp`);
}

function hashOf(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 32);
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function newIconId(): string {
  const bytes = randomBytes(12);
  let id = '';
  for (const byte of bytes) id += BASE32[byte & 31];
  return id;
}

// ── Picture normalization ───────────────────────────────────────────

export interface NormalizedIcon {
  data: Buffer;
  hash: string;
  animated: boolean;
  width: number;
  height: number;
  /** For a very wide or tall still picture, its centre square cut from the
   *  full-size original, which "Crop to a square" swaps in. Cropping the
   *  shrunk icon instead left a banner a blurry 77 px square. */
  square?: { data: Buffer; hash: string; width: number; height: number };
}

/** The stored picture's frame size (one frame of a moving picture). */
async function frameSize(data: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(data, { animated: true }).metadata();
  return { width: meta.width ?? 0, height: meta.pageHeight ?? meta.height ?? 0 };
}

const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);

/**
 * Turn an uploaded picture into the stored icon: a WebP no larger than
 * `ICON_EDGE_PX` on its longest side, never scaled up, with no metadata.
 * Moving pictures keep every frame and their timing. Everything is decoded
 * and re-encoded, so nothing else a crafted file carries survives, and the
 * format is read from the bytes, not from what the browser claimed.
 */
export async function normalizeIconImage(input: Buffer): Promise<NormalizedIcon> {
  if (input.length > MAX_UPLOAD_BYTES) throw customIconError('too-big');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(input, { animated: true }).metadata();
  } catch {
    throw customIconError('not-a-picture');
  }
  // A drawing is a picture to a parent; say what is wrong with this one.
  if (meta.format === 'svg') throw customIconError('svg-drawing');
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw customIconError('not-a-picture');
  const pages = meta.pages ?? 1;
  const frameHeight = meta.pageHeight ?? meta.height ?? 0;
  const width = meta.width ?? 0;
  // Checked from the header before anything is decoded: a small file can
  // claim a canvas that would take gigabytes to unpack on a Pi.
  if (!width || !frameHeight || width > MAX_SOURCE_EDGE_PX || frameHeight > MAX_SOURCE_EDGE_PX) {
    throw customIconError('picture-too-large');
  }
  if (pages > MAX_FRAMES) throw customIconError('animation-too-big');

  if (pages > 1) {
    for (const edge of [ICON_EDGE_PX, ...ANIMATED_FALLBACK_EDGES]) {
      const data = await sharp(input, { animated: true })
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
      if (data.length <= MAX_ANIMATED_BYTES) return { data, hash: hashOf(data), animated: true, ...(await frameSize(data)) };
    }
    throw customIconError('animation-too-big');
  }

  // Upright first, and trimmed of any see-through margin so a sticker fills
  // the space an emoji would. A picture that is all margin keeps its canvas.
  const upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const trimmed = meta.hasAlpha
    ? await sharp(upright.data).trim().toBuffer({ resolveWithObject: true }).catch(() => null)
    : null;
  const source = trimmed ?? upright;
  const data = await stillIcon(sharp(source.data));
  const size = await frameSize(data);

  let square: NormalizedIcon['square'];
  const { width: w, height: h } = source.info;
  if (w / h > 2 || h / w > 2) {
    const side = Math.min(w, h);
    const squareData = await stillIcon(sharp(source.data).extract({
      left: Math.floor((w - side) / 2), top: Math.floor((h - side) / 2), width: side, height: side,
    }));
    square = { data: squareData, hash: hashOf(squareData), ...(await frameSize(squareData)) };
  }
  return { data, hash: hashOf(data), animated: false, ...size, ...(square ? { square } : {}) };
}

async function stillIcon(image: ReturnType<typeof sharp>): Promise<Buffer> {
  const data = await image
    .resize({ width: ICON_EDGE_PX, height: ICON_EDGE_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
  if (data.length > MAX_STILL_BYTES) throw customIconError('picture-too-large');
  return data;
}

// ── Files ────────────────────────────────────────────────────────────

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Write one picture durably. A file already under this name holds the same
 *  bytes (the name is their hash), so it is left alone. */
async function writeIconFile(hash: string, data: Buffer): Promise<void> {
  const target = customIconFilePath(hash);
  if (!target) throw new Error('Invalid icon hash');
  try {
    await fs.access(target);
    return;
  } catch { /* not there yet */ }
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(tmp, 'wx', 0o644);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(tmp, target);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  await syncDirectory(dir);
}

/**
 * Remove every picture file the index no longer names, plus temp files a
 * crash left behind. Runs after a removal and a restore, inside the
 * transaction so no upload can be between writing its file and naming it.
 */
export function sweepCustomIconFiles(): Promise<void> {
  return withDataTransaction(async () => {
    const { icons } = await store.read();
    const keep = new Set(icons.flatMap((icon) => [icon.hash, icon.square?.hash].filter(Boolean).map((hash) => `${hash}.webp`)));
    let names: string[];
    try {
      names = await fs.readdir(iconDir());
    } catch {
      return;
    }
    await Promise.all(names
      .filter((name) => (name.endsWith('.webp') && !keep.has(name)) || name.endsWith('.tmp'))
      .map((name) => fs.unlink(path.join(iconDir(), name)).catch(() => {})));
  });
}

// ── Library ──────────────────────────────────────────────────────────

/** The kept icons: what every list, picker and backup shows. */
export async function readCustomIcons(): Promise<CustomIcon[]> {
  return (await store.read()).icons.filter((icon) => !icon.pending);
}

function isStalePending(icon: CustomIcon, now: number): boolean {
  return !!icon.pending && now - Date.parse(icon.createdAt) > PENDING_TTL_MS;
}

/** Everything counts toward the limits, pending uploads included: their
 *  files are on disk until kept or cleared. A picture already in the library
 *  adds nothing. */
function checkRoom(icons: readonly CustomIcon[], adding: { hash: string; bytes: number }): void {
  if (icons.length >= MAX_ICONS) throw customIconError('library-full');
  const extra = icons.some((icon) => icon.hash === adding.hash) ? 0 : adding.bytes;
  if (libraryBytes(icons) + extra > LIBRARY_BUDGET_BYTES) throw customIconError('budget-full');
}

export interface AddedCustomIcon {
  icon: CustomIcon;
  /** The same picture was already kept under this icon; nothing was added. */
  existing: boolean;
}

/**
 * Normalize and store one uploaded picture as a pending icon, which the
 * picker keeps with `keepCustomIcon` once the family says "Use this icon".
 * A picture the library already holds comes back as that icon instead of a
 * second copy nobody can tell apart from the first.
 */
export async function addCustomIcon(input: Buffer, rawName: unknown): Promise<AddedCustomIcon> {
  const name = normalizeIconName(rawName);
  if (!name) throw customIconError('bad-name');
  // The resize is the slow part and needs no lock, so it happens first.
  const normalized = await normalizeIconImage(input);
  return withDataTransaction(async () => {
    const now = Date.now();
    // Uploads nobody kept (a tab closed mid-review) are cleared here, the
    // next time anyone adds one.
    const current = (await store.read()).icons;
    if (current.some((icon) => isStalePending(icon, now))) {
      await store.updateAtomic((data) => ({ icons: data.icons.filter((icon) => !isStalePending(icon, now)) }));
      await sweepCustomIconFiles();
    }
    const kept = current.find((icon) => !icon.pending && icon.hash === normalized.hash);
    if (kept) return { icon: kept, existing: true };
    checkRoom(current.filter((icon) => !isStalePending(icon, now)), { hash: normalized.hash, bytes: normalized.data.length });
    await writeIconFile(normalized.hash, normalized.data);
    if (normalized.square) await writeIconFile(normalized.square.hash, normalized.square.data);
    const stamp = new Date(now).toISOString();
    const icon: CustomIcon = {
      id: newIconId(),
      name,
      hash: normalized.hash,
      bytes: normalized.data.length,
      animated: normalized.animated,
      width: normalized.width,
      height: normalized.height,
      ...(normalized.square ? {
        square: {
          hash: normalized.square.hash,
          bytes: normalized.square.data.length,
          width: normalized.square.width,
          height: normalized.square.height,
        },
      } : {}),
      pending: true,
      createdAt: stamp,
      updatedAt: stamp,
    };
    try {
      await store.updateAtomic((data) => {
        checkRoom(data.icons, icon);
        return { icons: [...data.icons, icon] };
      });
    } catch (error) {
      await sweepCustomIconFiles().catch(() => {});
      throw error;
    }
    return { icon, existing: false };
  });
}

/**
 * Rename an icon, and keep it if it was a pending upload. Keeping is what
 * puts a new picture in the lists; until then only its uploader sees it.
 */
export async function updateCustomIcon(id: string, changes: { name?: unknown; keep?: boolean }): Promise<CustomIcon> {
  const name = changes.name === undefined ? undefined : normalizeIconName(changes.name);
  if (name === null) throw customIconError('bad-name');
  let updated: CustomIcon | undefined;
  await store.updateAtomic((current) => {
    const index = current.icons.findIndex((icon) => icon.id === id);
    if (index < 0) throw customIconError('not-found');
    const icon = current.icons[index];
    const keep = changes.keep === true && icon.pending;
    if ((name === undefined || name === icon.name) && !keep) {
      updated = icon;
      return current;
    }
    const { pending: _pending, square: _square, ...rest } = icon;
    updated = { ...(keep ? rest : icon), name: name ?? icon.name, updatedAt: new Date().toISOString() };
    const icons = [...current.icons];
    icons[index] = updated;
    return { icons };
  });
  if (changes.keep) await sweepCustomIconFiles();
  return updated!;
}

/**
 * Swap a pending banner or tall strip for its centre square, cut from the
 * full-size original at upload. The review step offers it before the
 * picture is kept, so nothing else points at the old one.
 */
export async function cropCustomIconToSquare(id: string): Promise<CustomIcon> {
  return withDataTransaction(async () => {
    const icon = (await store.read()).icons.find((candidate) => candidate.id === id);
    if (!icon || !icon.pending || !icon.square) throw customIconError('not-found');
    const { square, ...rest } = icon;
    const cropped: CustomIcon = { ...rest, ...square, updatedAt: new Date().toISOString() };
    await store.updateAtomic((current) => {
      const icons = current.icons.map((candidate) => (candidate.id === id ? cropped : candidate));
      // The square can hold more bytes than the banner it replaces, and a
      // library over its budget is one a backup would refuse to restore.
      if (libraryBytes(icons) > LIBRARY_BUDGET_BYTES) throw customIconError('budget-full');
      return { icons };
    });
    await sweepCustomIconFiles();
    return cropped;
  });
}

/**
 * Remove one icon, and put everything that used it back to its kind's
 * standard picture (see `custom-icon-removal.ts`) in the same transaction, so
 * a crash lands the removal and the rewrites together or neither.
 */
export async function deleteCustomIcon(id: string): Promise<{ configChanged: boolean }> {
  return withDataTransaction(async () => {
    const { change: indexChange } = await store.planUpdate((current) => {
      if (!current.icons.some((icon) => icon.id === id)) throw customIconError('not-found');
      return { icons: current.icons.filter((icon) => icon.id !== id) };
    });
    const changes: TransactionChange[] = indexChange ? [indexChange] : [];
    const value = customIconValue(id);
    for (const { path: file, replacement } of ICON_REFERENCE_STORES) {
      const before = await readTransactionFile(file);
      if (before === null) continue;
      let doc: unknown;
      try {
        doc = JSON.parse(before);
      } catch {
        // A file that doesn't parse is not ours to rewrite; its own store
        // reports it, and its reference falls back where it is drawn.
        continue;
      }
      const next = replaceIconReferences(doc, value, replacement);
      if (next !== doc) changes.push({ path: file, before, after: JSON.stringify(next, null, 2) });
    }
    await commitDataTransaction({ kind: 'custom-icon-remove', changes });
    await sweepCustomIconFiles();
    // The editor holds its own copy of the config and must adopt this one.
    return { configChanged: changes.some((change) => change.path === 'data/config.json') };
  });
}

// ── Backup ───────────────────────────────────────────────────────────

/** The optional `customIcons` section of a backup bundle. */
export interface CustomIconBackup {
  icons: CustomIcon[];
  /** base64 picture bytes by hash */
  files: Record<string, string>;
}

export async function readCustomIconBackup(): Promise<CustomIconBackup> {
  return withDataTransaction(async () => {
    const icons = await readCustomIcons();
    const files: Record<string, string> = {};
    for (const icon of icons) {
      if (files[icon.hash]) continue;
      const file = customIconFilePath(icon.hash);
      if (!file) continue;
      try {
        files[icon.hash] = (await fs.readFile(file)).toString('base64');
      } catch { /* a missing picture renders as the usual one; skip it */ }
    }
    return { icons: icons.filter((icon) => files[icon.hash]), files };
  });
}

interface VerifiedRestore {
  icons: CustomIcon[];
  files: Map<string, Buffer>;
}

/**
 * Check a backup's icon section without writing anything: the shape, and
 * every picture's bytes (the hash must match, and it must decode as the
 * kind of file this store writes). A bad section returns a message.
 */
export async function verifyCustomIconBackup(section: unknown): Promise<VerifiedRestore | string> {
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(section) || !Array.isArray(section.icons) || !record(section.files)) return 'Icons need a list and their pictures.';
  if (section.icons.length > MAX_ICONS) return `A backup can hold at most ${MAX_ICONS} icons.`;
  const files = new Map<string, Buffer>();
  const icons: CustomIcon[] = [];
  const ids = new Set<string>();
  for (const raw of section.icons) {
    if (!record(raw)) return 'Each icon needs an id, a name and a picture.';
    const name = normalizeIconName(raw.name);
    const id = raw.id;
    const hash = raw.hash;
    if (typeof id !== 'string' || !CUSTOM_ICON_ID_RE.test(id) || ids.has(id) || !name
      || typeof hash !== 'string' || !CUSTOM_ICON_HASH_RE.test(hash)) {
      return 'Each icon needs an id, a name and a picture.';
    }
    ids.add(id);
    let data = files.get(hash);
    if (!data) {
      const encoded = section.files[hash];
      if (typeof encoded !== 'string') return `The picture for ${name} is missing.`;
      data = Buffer.from(encoded, 'base64');
      if (hashOf(data) !== hash || data.length > MAX_ANIMATED_BYTES) return `The picture for ${name} is damaged.`;
      try {
        const meta = await sharp(data, { animated: true }).metadata();
        const frameHeight = meta.pageHeight ?? meta.height ?? 0;
        if (meta.format !== 'webp' || !meta.width || meta.width > ICON_EDGE_PX || frameHeight > ICON_EDGE_PX
          || (meta.pages ?? 1) > MAX_FRAMES) {
          return `The picture for ${name} is damaged.`;
        }
      } catch {
        return `The picture for ${name} is damaged.`;
      }
      files.set(hash, data);
    }
    const now = new Date().toISOString();
    icons.push({
      id,
      name,
      hash,
      bytes: data.length,
      animated: raw.animated === true,
      ...(typeof raw.width === 'number' && typeof raw.height === 'number' ? { width: raw.width, height: raw.height } : {}),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    });
  }
  if (libraryBytes(icons) > LIBRARY_BUDGET_BYTES) return 'The icons in this backup are bigger than the space they are allowed.';
  return { icons, files };
}

/**
 * Plan replacing the library with a verified backup section. Call inside the
 * restore's transaction: the pictures are written here (unnamed until the
 * journal commits the index), and the returned change goes in the plan.
 * Run `sweepCustomIconFiles` after the commit to drop the replaced files.
 */
export async function planCustomIconRestore(verified: VerifiedRestore): Promise<TransactionChange | null> {
  for (const [hash, data] of verified.files) await writeIconFile(hash, data);
  const { change } = await store.planUpdate(() => ({ icons: verified.icons }));
  return change;
}
