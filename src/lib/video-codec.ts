/**
 * Which video format an MP4 or QuickTime file holds, read from the few boxes
 * that describe it (moov > trak > mdia > minf > stbl > stsd), never the video
 * itself. A phone's clip keeps that description at the end of the file, so
 * the walk hops from box header to box header and reads a few hundred bytes
 * however large the file is.
 *
 * It exists because iPhones record HEVC by default and the wall's Chromium on
 * a Raspberry Pi cannot play it: such a clip uploads fine and then shows as a
 * black slide. Older cameras' formats (MPEG-4 Part 2, Motion JPEG, ProRes)
 * fail the same way. A file that is not MP4 or QuickTime (WebM) reads as
 * 'unknown'.
 */

/** Reads up to `length` bytes at `offset`; fewer at the end of the file. */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

/** `web`: VP8, VP9 or AV1, which Chromium also plays. `other`: a picture format it does not. */
export type VideoCodec = 'hevc' | 'avc' | 'web' | 'other' | 'unknown';

/** Boxes on the way down to a track's sample description. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/** Sample entry formats that are HEVC underneath (Dolby Vision included). */
const HEVC_FORMATS = new Set(['hvc1', 'hev1', 'dvh1', 'dvhe']);
const AVC_FORMATS = new Set(['avc1', 'avc2', 'avc3', 'avc4']);
/** The other picture formats the wall's Chromium plays inside MP4 or QuickTime. */
const WEB_FORMATS = new Set(['vp08', 'vp09', 'av01']);

/** Audio and timecode tracks, which say nothing about the picture. */
const NOT_VIDEO_FORMATS = new Set(['mp4a', 'ac-3', 'ec-3', 'alac', 'lpcm', 'sowt', 'twos', 'Opus', 'fLaC', 'tmcd', 'mebx', 'text', 'tx3g']);

const MAX_DEPTH = 6;

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function uint32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

/** The picture format of the file's video track(s), or 'unknown' when it has none this can read. */
export async function videoCodecOf(read: ReadAt, size: number): Promise<VideoCodec> {
  const formats: string[] = [];

  async function walk(start: number, end: number, depth: number): Promise<void> {
    let offset = start;
    while (offset + 8 <= end) {
      const header = await read(offset, 16);
      if (header.length < 8) return;
      let boxSize = uint32(header, 0);
      const type = fourcc(header, 4);
      let headerSize = 8;
      if (boxSize === 1) {
        if (header.length < 16) return;
        // A 64-bit size (a big `mdat`); past 2^53 bytes nothing here matters.
        boxSize = uint32(header, 8) * 2 ** 32 + uint32(header, 12);
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - offset;
      }
      if (boxSize < headerSize) return;
      if (type === 'stsd') {
        // A full box: version and flags, the entry count, then the first
        // entry's size and format.
        const body = await read(offset + headerSize, 16);
        if (body.length >= 16) formats.push(fourcc(body, 12));
      } else if (CONTAINERS.has(type) && depth < MAX_DEPTH) {
        await walk(offset + headerSize, Math.min(end, offset + boxSize), depth + 1);
      }
      offset += boxSize;
    }
  }

  // Only a file that opens like MP4 or QuickTime is walked at all.
  const first = await read(0, 16);
  if (first.length < 8 || !['ftyp', 'wide', 'free', 'mdat', 'moov', 'skip'].includes(fourcc(first, 4))) return 'unknown';
  await walk(0, size, 0);

  const video = formats.filter((format) => !NOT_VIDEO_FORMATS.has(format));
  if (video.some((format) => HEVC_FORMATS.has(format))) return 'hevc';
  if (video.some((format) => AVC_FORMATS.has(format))) return 'avc';
  if (video.length > 0 && video.every((format) => WEB_FORMATS.has(format))) return 'web';
  return video.length > 0 ? 'other' : 'unknown';
}

/** `videoCodecOf` for a picked file, reading slices of it. */
export function videoCodecOfFile(file: Blob): Promise<VideoCodec> {
  return videoCodecOf(
    async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    file.size,
  );
}

/**
 * True for a picked video the wall cannot play: HEVC, which the Chromium on a
 * Pi does not decode, or any picture format it does not play at all, so it
 * would upload fine and then show as a black slide. A file that cannot be
 * read counts as playable; the hub still checks the type. Shared by every
 * place a video is added (the phone and Settings).
 */
export async function isUnplayableVideo(file: Blob): Promise<boolean> {
  const codec = await videoCodecOfFile(file).catch((): VideoCodec => 'unknown');
  return codec === 'hevc' || codec === 'other';
}
