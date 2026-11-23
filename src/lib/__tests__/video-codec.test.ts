import { describe, it, expect } from 'vitest';
import { isUnplayableVideo, videoCodecOf, videoCodecOfFile, type ReadAt } from '@/lib/video-codec';

/**
 * The files here are built box by box. A box is its size (4 bytes, big
 * endian), its four-letter type, then its payload; a container's payload is
 * more boxes.
 */

const ascii = (text: string) => new TextEncoder().encode(text);

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function box(type: string, ...payload: Uint8Array[]) {
  const body = concat(payload);
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(ascii(type), 4);
  out.set(body, 8);
  return out;
}

/** A box whose size field is 0: it runs to the end of whatever holds it. */
function openEndedBox(type: string, ...payload: Uint8Array[]) {
  const out = box(type, ...payload);
  new DataView(out.buffer).setUint32(0, 0);
  return out;
}

/** The 16-byte header of a box with a 64-bit size: size field 1, the type, then the real size. */
function largeHeader(type: string, size: number) {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, 1);
  out.set(ascii(type), 4);
  view.setBigUint64(8, BigInt(size));
  return out;
}

/** A sample description: version and flags, an entry count, then the first entry's size, format and more. */
function stsd(format: string) {
  const entry = new Uint8Array(24);
  new DataView(entry.buffer).setUint32(0, entry.length);
  entry.set(ascii(format), 4);
  return box('stsd', new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]), entry);
}

/** A track down to its format, with the boxes a real one keeps beside that path. */
function trak(format: string) {
  return box('trak',
    box('tkhd', new Uint8Array(84)),
    box('mdia',
      box('mdhd', new Uint8Array(24)),
      box('hdlr', new Uint8Array(25)),
      box('minf',
        box('vmhd', new Uint8Array(12)),
        box('stbl', stsd(format), box('stts', new Uint8Array(8))))));
}

const FTYP = box('ftyp', ascii('qt  '), new Uint8Array(4), ascii('qt  '));

function moov(...formats: string[]) {
  return box('moov', box('mvhd', new Uint8Array(100)), ...formats.map(trak));
}

/**
 * A file of `size` bytes holding `pieces` at their offsets and zeros between,
 * so a 4 GB clip costs no memory. It counts the reads and the bytes asked
 * for, and gives up after 200 reads so a walk that never ends fails instead
 * of hanging.
 */
function fileOf(size: number, pieces: [offset: number, bytes: Uint8Array][]) {
  const asked = { reads: 0, bytes: 0 };
  const read: ReadAt = async (offset, length) => {
    if (++asked.reads > 200) throw new Error('still reading after 200 reads');
    asked.bytes += length;
    const end = Math.min(size, offset + length);
    const out = new Uint8Array(Math.max(0, end - offset));
    for (const [at, bytes] of pieces) {
      const from = Math.max(offset, at);
      const to = Math.min(end, at + bytes.length);
      if (from < to) out.set(bytes.subarray(from - at, to - at), from - offset);
    }
    return out;
  };
  return { read, asked, codec: () => videoCodecOf(read, size) };
}

const whole = (bytes: Uint8Array) => fileOf(bytes.length, [[0, bytes]]);
const codecOf = (...parts: Uint8Array[]) => whole(concat(parts)).codec();

describe('videoCodecOf', () => {
  it('reads an H.264 clip as avc', async () => {
    await expect(codecOf(FTYP, moov('avc1'))).resolves.toBe('avc');
  });

  it.each(['hvc1', 'hev1', 'dvh1'])('reads a %s clip as hevc', async (format) => {
    await expect(codecOf(FTYP, moov(format))).resolves.toBe('hevc');
  });

  it('reads the video track of a clip with sound', async () => {
    await expect(codecOf(FTYP, moov('mp4a', 'hvc1'))).resolves.toBe('hevc');
    await expect(codecOf(FTYP, moov('mp4a', 'avc1'))).resolves.toBe('avc');
  });

  it('reads VP9 and AV1 as web, and an older camera format as other', async () => {
    await expect(codecOf(FTYP, moov('vp09'))).resolves.toBe('web');
    await expect(codecOf(FTYP, moov('mp4a', 'av01'))).resolves.toBe('web');
    await expect(codecOf(FTYP, moov('mp4v'))).resolves.toBe('other');
    await expect(codecOf(FTYP, moov('jpeg'))).resolves.toBe('other');
  });

  it('reads a file with only sound as unknown', async () => {
    await expect(codecOf(FTYP, moov('mp4a'))).resolves.toBe('unknown');
  });

  it('finds the description after the video data, as phones write it, reading only box headers', async () => {
    const bytes = concat([FTYP, box('wide'), box('mdat', new Uint8Array(4 * 1024 * 1024)), moov('mp4a', 'hvc1')]);
    const file = whole(bytes);

    await expect(file.codec()).resolves.toBe('hevc');
    expect(file.asked.bytes).toBeLessThan(1024);
  });

  it('skips video data with a 64-bit size, even past 4 GB', async () => {
    // The size's high word is 1 here, so reading only the low word lands in the zeros.
    const mdatSize = 2 ** 32 + 1000;
    const moovAt = FTYP.length + mdatSize;
    const tail = moov('mp4a', 'hvc1');
    const file = fileOf(moovAt + tail.length, [
      [0, FTYP],
      [FTYP.length, largeHeader('mdat', mdatSize)],
      [moovAt, tail],
    ]);

    await expect(file.codec()).resolves.toBe('hevc');
    expect(file.asked.bytes).toBeLessThan(1024);
  });

  it('reads a last box whose size is 0 up to the end of the file', async () => {
    await expect(codecOf(FTYP, box('mdat', new Uint8Array(64)), openEndedBox('moov', trak('hvc1')))).resolves.toBe('hevc');
  });

  it.each([
    ['WebM', [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81]],
    ['JPEG', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]],
  ])('reads a %s file as unknown after one read', async (_, head) => {
    const file = whole(concat([new Uint8Array(head), new Uint8Array(4096)]));

    await expect(file.codec()).resolves.toBe('unknown');
    expect(file.asked.reads).toBe(1);
  });

  describe('a broken file', () => {
    const complete = concat([FTYP, moov('hvc1')]);
    const insideDescription = Buffer.from(complete).indexOf('stsd') + 4 + 10;

    it.each([
      ['a box smaller than its own header', concat([FTYP, new Uint8Array([0, 0, 0, 4]), ascii('moov'), moov('hvc1')])],
      ['a file cut off inside the sample description', complete.slice(0, insideDescription)],
      ['a file cut off inside a box header', concat([FTYP, new Uint8Array([0, 0, 1, 0, 0x6d])])],
      ['a file cut off inside a 64-bit size', concat([FTYP, largeHeader('mdat', 1 << 20).slice(0, 12)])],
      ['a size-0 box ahead of the description', concat([FTYP, openEndedBox('free', new Uint8Array(32)), moov('hvc1')])],
      ['a file that is only its ftyp', FTYP],
    ])('stops on %s', async (_, bytes) => {
      const file = whole(bytes);

      await expect(file.codec()).resolves.toBe('unknown');
      expect(file.asked.reads).toBeLessThan(40);
    });
  });
});

describe('videoCodecOfFile', () => {
  it('reads a picked file through slices of it', async () => {
    const clip = new Blob([concat([FTYP, box('mdat', new Uint8Array(4096)), moov('mp4a', 'hvc1')])], { type: 'video/quicktime' });
    await expect(videoCodecOfFile(clip)).resolves.toBe('hevc');
  });

  it('reads a WebM file as unknown', async () => {
    await expect(videoCodecOfFile(new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])]))).resolves.toBe('unknown');
  });
});

describe('isUnplayableVideo', () => {
  const clip = (...parts: Uint8Array[]) => new Blob([concat(parts)]);

  it('is true for an HEVC video, which the wall cannot play', async () => {
    expect(await isUnplayableVideo(clip(FTYP, moov('hvc1')))).toBe(true);
    expect(await isUnplayableVideo(clip(FTYP, moov('mp4a', 'hev1')))).toBe(true);
  });

  it('is true for an older camera format the wall cannot play either', async () => {
    // MPEG-4 Part 2 and Motion JPEG upload fine and then show a black card.
    expect(await isUnplayableVideo(clip(FTYP, moov('mp4v')))).toBe(true);
    expect(await isUnplayableVideo(clip(FTYP, moov('mp4a', 'mjpa')))).toBe(true);
  });

  it('is false for H.264, VP9, AV1 and for a file that does not open like MP4', async () => {
    expect(await isUnplayableVideo(clip(FTYP, moov('avc1')))).toBe(false);
    expect(await isUnplayableVideo(clip(FTYP, moov('vp09')))).toBe(false);
    expect(await isUnplayableVideo(clip(FTYP, moov('av01')))).toBe(false);
    expect(await isUnplayableVideo(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])]))).toBe(false);
  });

  it('counts a file that cannot be read as playable, leaving it to the hub', async () => {
    const unreadable = { size: 64, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }) } as unknown as Blob;
    expect(await isUnplayableVideo(unreadable)).toBe(false);
  });
});
