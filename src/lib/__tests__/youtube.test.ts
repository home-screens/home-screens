import { describe, it, expect } from 'vitest';
import { parseYouTubeVideoId, buildYouTubeEmbedUrl, youTubeThumbnailUrl } from '@/lib/youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeVideoId', () => {
  it('parses the standard watch URL', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('parses watch URLs with extra params (timestamps, playlists, share tracking)', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s&list=PLx`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?app=desktop&v=${ID}`)).toBe(ID);
  });

  it('parses youtu.be short links', () => {
    expect(parseYouTubeVideoId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://youtu.be/${ID}?si=share-token&t=10`)).toBe(ID);
  });

  it('parses shorts, embed, and live paths', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it('parses mobile and music hosts', () => {
    expect(parseYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it('returns null for non-YouTube URLs and direct video files', () => {
    expect(parseYouTubeVideoId('https://example.com/clip.mp4')).toBeNull();
    expect(parseYouTubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeVideoId('/api/backgrounds/serve?file=clip.mp4')).toBeNull();
    expect(parseYouTubeVideoId('')).toBeNull();
    expect(parseYouTubeVideoId('not a url')).toBeNull();
  });

  it('returns null for lookalike hosts and malformed IDs', () => {
    expect(parseYouTubeVideoId(`https://notyoutube.com/watch?v=${ID}`)).toBeNull();
    expect(parseYouTubeVideoId(`https://fakeyoutu.be/${ID}`)).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=too-short')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/playlist?list=PLx')).toBeNull();
    expect(parseYouTubeVideoId(`javascript:alert(1)//watch?v=${ID}`)).toBeNull();
  });
});

describe('buildYouTubeEmbedUrl', () => {
  it('builds a kiosk embed on the nocookie host with autoplay and no controls', () => {
    const url = new URL(buildYouTubeEmbedUrl(ID, { muted: true, loop: false }));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('controls')).toBe('0');
    expect(url.searchParams.get('playsinline')).toBe('1');
  });

  it('maps muted:false to mute=0', () => {
    const url = new URL(buildYouTubeEmbedUrl(ID, { muted: false, loop: false }));
    expect(url.searchParams.get('mute')).toBe('0');
  });

  it('loop uses the single-video playlist trick', () => {
    const url = new URL(buildYouTubeEmbedUrl(ID, { muted: true, loop: true }));
    expect(url.searchParams.get('loop')).toBe('1');
    expect(url.searchParams.get('playlist')).toBe(ID);
  });
});

describe('youTubeThumbnailUrl', () => {
  it('points at the hqdefault thumbnail', () => {
    expect(youTubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
