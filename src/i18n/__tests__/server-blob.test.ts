import { describe, it, expect, vi } from 'vitest';
import { buildLocaleBlob, encodeBlobForScriptTag } from '../server-blob';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe('buildLocaleBlob', () => {
  it('returns a record keyed by the requested namespaces', async () => {
    const blob = await buildLocaleBlob('en-US', ['core', 'modules']);
    expect(Object.keys(blob).sort()).toEqual(['core', 'modules']);
  });

  it('returns the en-US dictionaries as plain JSON-shaped objects', async () => {
    const blob = await buildLocaleBlob('en-US', ['core']);
    expect(blob.core).toBeDefined();
    // `today` is part of the Task 1 seed translations; the assertion makes
    // sure we're reading the actual file, not surfacing an empty fallback.
    expect(blob.core.today).toBe('Today');
  });

  it('falls back through the locale chain for missing namespaces', async () => {
    // de-DE currently ships only `core`, `modules`, `editor` — a missing
    // weather/remote namespace should fall back to en-US, NOT return an
    // empty dict, so the display still shows something usable.
    const blob = await buildLocaleBlob('de-DE', ['core', 'weather']);
    expect(blob.core.today).toBe('Heute');
    // weather.json is currently empty `{}` for both en-US and de-DE — the
    // important assertion is that the field is present at all (a valid
    // empty Dictionary), not that it has any keys.
    expect(typeof blob.weather).toBe('object');
  });

  it('serves the fallback locale for an unregistered tag', async () => {
    const blob = await buildLocaleBlob('xx-YY', ['core']);
    expect(blob.core.today).toBe('Today');
  });

  it('rejects path-traversal locale tags and warns once', async () => {
    // The server-blob locale guard refuses anything with `/`, `\`, `..`,
    // or other path-component characters so an attacker can't escape
    // `src/translations`. Rejected tags fall through to the fallback
    // locale so the layout still produces a usable blob.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const blob = await buildLocaleBlob('../../../etc/passwd', ['core']);
      expect(blob.core.today).toBe('Today');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('rejects locale tags containing slashes', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const blob = await buildLocaleBlob('en/US', ['core']);
      // Falls back to en-US — the rejected tag never touched the disk.
      expect(blob.core.today).toBe('Today');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('encodeBlobForScriptTag', () => {
  it('escapes embedded </script> sequences so the blob cannot break out', () => {
    const out = encodeBlobForScriptTag({ ns: { evil: '</script>' } });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script>');
  });

  it('round-trips through JSON.parse for normal content', () => {
    const blob = { core: { today: 'Today' } };
    const out = encodeBlobForScriptTag(blob);
    expect(JSON.parse(out)).toEqual(blob);
  });

  it('escapes U+2028 and U+2029 line separators', () => {
    const blob = {
      ns: {
        sep: `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`,
      },
    };
    const out = encodeBlobForScriptTag(blob);
    expect(out).not.toContain(LINE_SEPARATOR);
    expect(out).not.toContain(PARAGRAPH_SEPARATOR);
    // The escaped form still parses back to the original characters.
    expect(JSON.parse(out)).toEqual(blob);
  });
});
