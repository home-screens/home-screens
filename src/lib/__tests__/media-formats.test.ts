import { describe, it, expect } from 'vitest';
import { LIVE_COMPANION_RE, clipIndex, companionsLast, liveUploadPairing, picturesWithClips, unpairedLiveClips, extensionForContentType, liveCompanionsFor, mediaKindOf, pictureContentType, sniffImageContentType } from '@/lib/media-formats';

describe('extensionForContentType', () => {
  it.each([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['image/avif', '.avif'],
    ['video/mp4', '.mp4'],
    ['video/quicktime', '.mov'],
    ['video/webm', '.webm'],
  ])('saves %s as %s', (type, ext) => {
    expect(extensionForContentType(type)).toBe(ext);
    // Every answer is a name the library lists as media.
    expect(mediaKindOf(`x${ext}`)).toBe(type.split('/')[0] === 'image' ? 'image' : 'video');
  });

  it('ignores parameters, spaces and case', () => {
    expect(extensionForContentType('image/jpeg; charset=binary')).toBe('.jpg');
    expect(extensionForContentType('  IMAGE/PNG ')).toBe('.png');
  });

  it('refuses what the display cannot show or should not take from another service', () => {
    for (const type of ['image/tiff', 'image/heic', 'image/bmp', 'image/svg+xml', 'text/html', 'application/octet-stream', '', null, undefined]) {
      expect(extensionForContentType(type)).toBeNull();
    }
  });

  it('answers only the asked-for kind', () => {
    expect(extensionForContentType('image/png', 'image')).toBe('.png');
    expect(extensionForContentType('video/mp4', 'image')).toBeNull();
    expect(extensionForContentType('video/mp4', 'video')).toBe('.mp4');
    expect(extensionForContentType('image/png', 'video')).toBeNull();
  });
});

describe('sniffImageContentType', () => {
  const bytes = (...parts: Array<number[] | string>) => new Uint8Array(
    parts.flatMap((part) => (typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part)),
  );

  it.each([
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')],
    ['image/png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])],
    ['image/gif', bytes('GIF89a', [1, 0, 1, 0])],
    ['image/gif', bytes('GIF87a', [1, 0, 1, 0])],
    ['image/webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ')],
    ['image/avif', bytes([0, 0, 0, 0x20], 'ftypavif')],
  ])('reads %s from the first bytes', (type, head) => {
    expect(sniffImageContentType(head)).toBe(type);
  });

  it('has no answer for bytes that are not a picture the wall can show', () => {
    // HEIC shares AVIF's container; only the brand tells them apart.
    expect(sniffImageContentType(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBeNull();
    expect(sniffImageContentType(bytes([0, 0, 0, 0x18], 'ftypmp42'))).toBeNull();
    expect(sniffImageContentType(bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '))).toBeNull();
    expect(sniffImageContentType(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImageContentType(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImageContentType(new Uint8Array())).toBeNull();
  });
});

describe('pictureContentType', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const NOT_A_PICTURE = new Uint8Array([1, 2, 3, 4]);

  it('keeps the declared type when it names a picture the display can show', () => {
    expect(pictureContentType('image/png', JPEG)).toBe('image/png');
    expect(pictureContentType('image/jpeg; charset=binary', NOT_A_PICTURE)).toBe('image/jpeg; charset=binary');
  });

  it('reads the bytes when the declared type says nothing, or names something else', () => {
    for (const declared of ['application/octet-stream', 'binary/octet-stream', 'image/jpg', 'video/mp4', '', null, undefined]) {
      expect(pictureContentType(declared, JPEG)).toBe('image/jpeg');
    }
  });

  it('has no answer when neither names a picture the display can show', () => {
    expect(pictureContentType('application/octet-stream', NOT_A_PICTURE)).toBeNull();
    expect(pictureContentType('image/tiff', NOT_A_PICTURE)).toBeNull();
    expect(pictureContentType(null, new Uint8Array())).toBeNull();
  });
});

describe('LIBRARY_PICKER_ACCEPT', () => {
  it('keeps the editor on image/* and the phone on listed picture types', async () => {
    const { LIBRARY_PICKER_ACCEPT } = await import('../media-formats');
    expect(LIBRARY_PICKER_ACCEPT).toEqual({
      image: 'image/*',
      video: 'video/mp4,video/webm,video/quicktime',
      both: 'image/*,video/mp4,video/webm,video/quicktime',
      // Listed one by one: this is what makes an iPhone send a HEIC photo as a JPEG.
      phone: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime',
    });
  });

  it('tells a video by its type, or by its name when the picker left the type empty', async () => {
    const { isVideoUpload } = await import('../media-formats');
    expect(isVideoUpload({ type: 'video/quicktime', name: 'a' })).toBe(true);
    expect(isVideoUpload({ type: '', name: 'clip.MOV' })).toBe(true);
    expect(isVideoUpload({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });
});

describe('Live Photo companions', () => {
  it('names both containers, QuickTime first', () => {
    // Apple hands these out as QuickTime: H.264 and AAC, which every browser
    // plays, in a `qt  ` container rather than an MP4 one. Renaming it .mp4
    // would make the serve route declare video/mp4 over QuickTime bytes.
    expect(liveCompanionsFor('IMG_1234.JPG')).toEqual(['IMG_1234.live.mov', 'IMG_1234.live.mp4']);
  });

  it('replaces only the last extension', () => {
    expect(liveCompanionsFor('holiday.2026.jpg')[0]).toBe('holiday.2026.live.mov');
  });

  it('pairs whatever case either half was written in', () => {
    // A Mac writes IMG_1.live.MOV. Without the lowercased lookup the clip
    // would sit in the folder, listed as an ordinary video, and never play
    // over the picture it was taken with.
    expect(clipIndex(['IMG_1.live.MOV'])('IMG_1.JPG')).toBe('IMG_1.live.MOV');
    expect(clipIndex(['img_1.LIVE.mp4'])('IMG_1.jpg')).toBe('img_1.LIVE.mp4');
  });

  it('does not pair a clip with a different picture', () => {
    expect(clipIndex(['IMG_2.live.mov'])('IMG_1.JPG')).toBeUndefined();
  });

  it('prefers the QuickTime half when a folder somehow holds both', () => {
    expect(clipIndex(['a.live.mp4', 'a.live.mov'])('a.jpg')).toBe('a.live.mov');
  });

  it('builds the lookup once for a whole folder', () => {
    const find = clipIndex(['a.jpg', 'a.live.mov', 'b.jpg', 'b.live.mp4', 'notes.txt']);
    expect(find('a.jpg')).toBe('a.live.mov');
    expect(find('b.jpg')).toBe('b.live.mp4');
    expect(find('notes.txt')).toBeUndefined();
  });

  it('leaves an ordinary movie beside a photo alone', () => {
    // A camera dump holds IMG_1234.JPG next to IMG_1234.MOV as two separate
    // things a household wants shown separately. Pairing on a shared base
    // name would silently swallow the video.
    expect(LIVE_COMPANION_RE.test('IMG_1234.MOV')).toBe(false);
    expect(clipIndex(['IMG_1234.MOV'])('IMG_1234.JPG')).toBeUndefined();
  });
});

describe('a clip two pictures could claim', () => {
  it('belongs to neither, rather than to whichever was asked first', () => {
    // a.jpg and a.png both resolve to a.live.mov, and there is no telling
    // whose moment it was. Pairing it with one would play that photo's
    // movement over the other one every pass.
    const find = clipIndex(['a.jpg', 'a.png', 'a.live.mov']);
    expect(find('a.jpg')).toBeUndefined();
    expect(find('a.png')).toBeUndefined();
  });

  it('still pairs when only one picture claims it', () => {
    const find = clipIndex(['a.jpg', 'b.png', 'a.live.mov']);
    expect(find('a.jpg')).toBe('a.live.mov');
    expect(find('b.png')).toBeUndefined();
  });
});

describe('uploading a Live Photo', () => {
  it('sends the clips after everything else, otherwise in the order picked', () => {
    const names = ['IMG_2.live.mov', 'IMG_1.jpg', 'clip.mp4', 'IMG_1.live.MOV', 'IMG_2.jpg'].map((name) => ({ name }));
    expect(companionsLast(names).map((f) => f.name))
      .toEqual(['IMG_1.jpg', 'clip.mp4', 'IMG_2.jpg', 'IMG_2.live.mov', 'IMG_1.live.MOV']);
  });

  it('sends a clip under the name its picture was saved as', () => {
    // Two family iPhones both make an IMG_1234; the second one's picture
    // lands as IMG_1234-2.jpg and its clip has to follow it.
    const pairing = liveUploadPairing();
    pairing.landed('IMG_1234.JPG', 'IMG_1234-2.JPG');
    pairing.landed('beach.mov', 'beach-2.mov');
    expect(pairing.nameFor('IMG_1234.live.mov')).toBe('IMG_1234-2.live.mov');
    expect(pairing.nameFor('img_1234.live.MP4')).toBe('IMG_1234-2.live.MP4');
    // A video never claims a clip, and a clip with no picture keeps its name.
    expect(pairing.nameFor('beach.live.mov')).toBe('beach.live.mov');
    expect(pairing.nameFor('IMG_9.live.mov')).toBe('IMG_9.live.mov');
    expect(pairing.nameFor('IMG_1234.mov')).toBe('IMG_1234.mov');
  });

  it('keeps the name the server tidied a picture to', () => {
    const pairing = liveUploadPairing();
    pairing.landed('IMG 1234.jpg', 'IMG_1234.jpg');
    expect(pairing.nameFor('IMG 1234.live.mov')).toBe('IMG_1234.live.mov');
  });
});

describe('a clip whose picture has gone', () => {
  it('is claimed by no other file of the same name', () => {
    // An Apple export left as it came (IMG_1.MOV) beside the renamed copy,
    // with the still deleted or never converted: nothing can show the clip
    // as movement, so it must stay an ordinary video and not vanish.
    const names = ['IMG_1.MOV', 'IMG_1.live.mov', 'IMG_1.HEIC', 'IMG_2.jpg'];
    const find = clipIndex(names);
    expect(names.map(find).filter(Boolean)).toEqual([]);
  });
});

describe('picturesWithClips', () => {
  it('counts the chosen pictures that have a Live Photo clip in their own folder', () => {
    const all = ['trip/IMG_1.jpg', 'trip/IMG_1.live.mov', 'trip/IMG_2.jpg', 'home/IMG_2.live.mov', 'IMG_3.jpg', 'IMG_3.live.mp4'];
    expect(picturesWithClips(['trip/IMG_1.jpg', 'trip/IMG_2.jpg', 'IMG_3.jpg'], all)).toBe(2);
    // A clip chosen on its own is not a picture with a clip.
    expect(picturesWithClips(['trip/IMG_1.live.mov'], all)).toBe(0);
  });
});

describe('unpairedLiveClips', () => {
  it('pairs each iPhone export with the picture of its name', () => {
    expect(unpairedLiveClips(['IMG_1.JPG', 'IMG_1.MOV', 'IMG_2.jpg', 'IMG_2.mov', 'IMG_3.png', 'IMG_3.mp4'])).toEqual([
      { from: 'IMG_1.MOV', to: 'IMG_1.live.mov' },
      { from: 'IMG_2.mov', to: 'IMG_2.live.mov' },
      { from: 'IMG_3.mp4', to: 'IMG_3.live.mp4' },
    ]);
  });

  it('leaves a video with no picture, a picture that has a clip, a shared name and a taken name alone', () => {
    expect(unpairedLiveClips(['party.mov'])).toEqual([]);
    expect(unpairedLiveClips(['IMG_1.jpg', 'IMG_1.live.mov', 'IMG_1.MOV'])).toEqual([]);
    expect(unpairedLiveClips(['IMG_1.jpg', 'IMG_1.png', 'IMG_1.MOV'])).toEqual([]);
    expect(unpairedLiveClips(['IMG_1.jpg', 'IMG_1.MOV', 'IMG_1.mp4'])).toEqual([{ from: 'IMG_1.MOV', to: 'IMG_1.live.mov' }]);
  });
});
