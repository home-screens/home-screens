import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isBlockedHost, isSafeExternalUrl, isSafeLocalOrExternalUrl, checkedLookup, isAddressBlockedError, type AddressRule,
} from '@/lib/url-safety';
import { promises as dns } from 'dns';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isBlockedHost', () => {
  it('blocks localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true);
  });

  it('blocks 0.0.0.0', () => {
    expect(isBlockedHost('0.0.0.0')).toBe(true);
  });

  it('blocks private/loopback IPv6 addresses (bracketed)', () => {
    expect(isBlockedHost('[::1]')).toBe(true);                  // loopback
    expect(isBlockedHost('[::]')).toBe(true);                   // unspecified
    expect(isBlockedHost('[::ffff:127.0.0.1]')).toBe(true);     // IPv4-mapped loopback
    expect(isBlockedHost('[::ffff:10.0.0.1]')).toBe(true);      // IPv4-mapped private
    expect(isBlockedHost('[fe80::1]')).toBe(true);              // link-local
    expect(isBlockedHost('[febf::cafe]')).toBe(true);           // link-local upper bound
    expect(isBlockedHost('[fc00::1]')).toBe(true);              // unique local
    expect(isBlockedHost('[fd12:3456::1]')).toBe(true);         // unique local
  });

  it('allows public IPv6 addresses (bracketed)', () => {
    // Regression: previous implementation blanket-blocked all bracketed
    // IPv6 hosts, breaking dual-stack APIs and CDNs that resolve via AAAA.
    expect(isBlockedHost('[2001:db8::1]')).toBe(false);
    expect(isBlockedHost('[2606:2800:220:1:248:1893:25c8:1946]')).toBe(false); // example.com
    expect(isBlockedHost('[2606:4700:4700::1111]')).toBe(false);               // 1.1.1.1
  });

  it('handles bare IPv6 addresses (as returned by dns.lookup)', () => {
    expect(isBlockedHost('::1')).toBe(true);
    expect(isBlockedHost('fe80::1')).toBe(true);
    expect(isBlockedHost('2001:db8::1')).toBe(false);
  });

  it('strips zone identifiers from IPv6 addresses', () => {
    expect(isBlockedHost('fe80::1%eth0')).toBe(true);
  });

  it('blocks 127.0.0.0/8 loopback', () => {
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('127.255.255.255')).toBe(true);
  });

  it('blocks 10.0.0.0/8 private', () => {
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('10.255.255.255')).toBe(true);
  });

  it('blocks 172.16.0.0/12 private', () => {
    expect(isBlockedHost('172.16.0.1')).toBe(true);
    expect(isBlockedHost('172.31.255.255')).toBe(true);
  });

  it('does not block 172 outside /12 range', () => {
    expect(isBlockedHost('172.15.0.1')).toBe(false);
    expect(isBlockedHost('172.32.0.1')).toBe(false);
  });

  it('blocks 192.168.0.0/16 private', () => {
    expect(isBlockedHost('192.168.0.1')).toBe(true);
    expect(isBlockedHost('192.168.255.255')).toBe(true);
  });

  it('blocks full 169.254.0.0/16 link-local range', () => {
    expect(isBlockedHost('169.254.169.254')).toBe(true); // AWS/GCP metadata
    expect(isBlockedHost('169.254.170.2')).toBe(true);   // ECS task metadata
    expect(isBlockedHost('169.254.0.1')).toBe(true);     // link-local gateway
  });

  it('allows public IPs', () => {
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('1.1.1.1')).toBe(false);
    expect(isBlockedHost('203.0.113.1')).toBe(false);
  });

  it('allows public hostnames', () => {
    expect(isBlockedHost('api.example.com')).toBe(false);
    expect(isBlockedHost('images.unsplash.com')).toBe(false);
  });
});

describe('an IPv4 address written inside an IPv6 one', () => {
  // `new URL()` writes [::ffff:127.0.0.1] as [::ffff:7f00:1], so a URL's
  // hostname never carries the dotted form. Every spelling must be judged as
  // the IPv4 address it holds.
  const spellings = (v4hex: string, dotted: string) => [
    `[::ffff:${dotted}]`, `[::ffff:${v4hex}]`, `[0:0:0:0:0:ffff:${v4hex}]`, `[::${v4hex}]`, `[::${dotted}]`,
  ];

  it('blocks the hub itself, the home network and the metadata address, however written', () => {
    for (const [hex, dotted] of [['7f00:1', '127.0.0.1'], ['c0a8:101', '192.168.1.1'], ['a00:1', '10.0.0.1'], ['a9fe:a9fe', '169.254.169.254']]) {
      for (const host of spellings(hex, dotted)) expect(isBlockedHost(host), host).toBe(true);
    }
  });

  it('allows a public IPv4 address carried the same way', () => {
    for (const host of spellings('808:808', '8.8.8.8')) expect(isBlockedHost(host), host).toBe(false);
  });

  it('refuses such a URL before any lookup, in the strict check', async () => {
    const lookup = vi.spyOn(dns, 'lookup');
    for (const url of ['http://[::ffff:127.0.0.1]:3000/', 'http://[::ffff:c0a8:101]/', 'http://[::ffff:169.254.169.254]/']) {
      expect(await isSafeExternalUrl(url), url).toBe(false);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it('still refuses the metadata address, and only it, on the home-network path', async () => {
    expect(await isSafeLocalOrExternalUrl('http://[::ffff:169.254.169.254]/')).toBe(false);
    expect(await isSafeLocalOrExternalUrl('http://[::ffff:a9fe:a9fe]/')).toBe(false);
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '::ffff:c0a8:101', family: 6 }] as never);
    expect(await isSafeLocalOrExternalUrl('http://[::ffff:c0a8:101]/')).toBe(true);
  });

  it('judges a name that resolves to such an address by the address inside', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '::ffff:7f00:1', family: 6 }] as never);
    expect(await isSafeExternalUrl('https://rebind.example.com/')).toBe(false);
  });
});

describe('isSafeExternalUrl', () => {
  // Helper: stub dns.lookup to return the given addresses without hitting the network
  function mockResolve(addresses: string[]) {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never,
    );
  }

  it('allows https URLs to public hosts', async () => {
    mockResolve(['203.0.113.10']);
    expect(await isSafeExternalUrl('https://api.example.com/data')).toBe(true);
  });

  it('allows http URLs to public hosts', async () => {
    mockResolve(['203.0.113.10']);
    expect(await isSafeExternalUrl('http://api.example.com/data')).toBe(true);
  });

  it('blocks non-http protocols (no DNS lookup needed)', async () => {
    expect(await isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeExternalUrl('ftp://example.com/file')).toBe(false);
    expect(await isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('fast-path blocks literal private/internal hosts without DNS lookup', async () => {
    const lookupSpy = vi.spyOn(dns, 'lookup');
    expect(await isSafeExternalUrl('http://localhost:3000/api/config')).toBe(false);
    expect(await isSafeExternalUrl('http://127.0.0.1/admin')).toBe(false);
    expect(await isSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(await isSafeExternalUrl('http://10.0.0.1/internal')).toBe(false);
    expect(await isSafeExternalUrl('http://192.168.1.1/config')).toBe(false);
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it('returns false for malformed URLs', async () => {
    expect(await isSafeExternalUrl('')).toBe(false);
    expect(await isSafeExternalUrl('not-a-url')).toBe(false);
    expect(await isSafeExternalUrl('://missing-scheme')).toBe(false);
  });

  // ── DNS rebinding protection ───────────────────────────────────────────

  it('blocks public-looking hostname that resolves to loopback', async () => {
    mockResolve(['127.0.0.1']);
    expect(await isSafeExternalUrl('http://evil.attacker.com/path')).toBe(false);
  });

  it('blocks public-looking hostname that resolves to AWS metadata IP', async () => {
    mockResolve(['169.254.169.254']);
    expect(await isSafeExternalUrl('http://metadata.attacker.com/')).toBe(false);
  });

  it('blocks public-looking hostname that resolves to a private RFC1918 address', async () => {
    mockResolve(['10.0.5.42']);
    expect(await isSafeExternalUrl('https://lan.attacker.com/')).toBe(false);
  });

  it('blocks when ANY resolved address is internal (multi-A response)', async () => {
    // First address is public, second is private — must reject
    mockResolve(['8.8.8.8', '192.168.1.10']);
    expect(await isSafeExternalUrl('https://mixed.attacker.com/')).toBe(false);
  });

  it('blocks IPv6 loopback returned via AAAA record', async () => {
    mockResolve(['::1']);
    expect(await isSafeExternalUrl('http://v6.attacker.com/')).toBe(false);
  });

  it('blocks IPv6 link-local returned via AAAA', async () => {
    mockResolve(['fe80::1']);
    expect(await isSafeExternalUrl('http://v6ll.attacker.com/')).toBe(false);
  });

  it('blocks IPv6 unique-local (fc00::/7) returned via AAAA', async () => {
    mockResolve(['fd12:3456:789a::1']);
    expect(await isSafeExternalUrl('http://v6ula.attacker.com/')).toBe(false);
  });

  it('allows public IPv6 returned via AAAA (regression: dual-stack CDNs)', async () => {
    mockResolve(['2606:4700:4700::1111']);
    expect(await isSafeExternalUrl('https://dual-stack.example.com/')).toBe(true);
  });

  it('allows dual-stack hostname (mix of public IPv4 and public IPv6)', async () => {
    mockResolve(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);
    expect(await isSafeExternalUrl('https://example.com/')).toBe(true);
  });

  it('returns false when DNS resolution fails entirely', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
    expect(await isSafeExternalUrl('http://nonexistent.example/')).toBe(false);
  });

  it('always re-resolves (no cache — closes the DNS rebinding window)', async () => {
    // Regression: a previous version cached resolved addresses for 60s,
    // which let an attacker present a public IP on the first lookup and
    // rebind to a private IP for the next 60 seconds while subsequent
    // fetches did their own (now stale) DNS lookup. Always re-resolve.
    const lookupSpy = vi.spyOn(dns, 'lookup').mockResolvedValue(
      [{ address: '203.0.113.5', family: 4 }] as never,
    );
    expect(await isSafeExternalUrl('https://repeated.example.com/')).toBe(true);
    expect(await isSafeExternalUrl('https://repeated.example.com/other')).toBe(true);
    expect(lookupSpy).toHaveBeenCalledTimes(2);
  });
});

describe('isSafeLocalOrExternalUrl (localNetwork permission)', () => {
  function mockResolve(addresses: string[]) {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never,
    );
  }

  it('allows public hosts (same as strict check)', async () => {
    mockResolve(['203.0.113.10']);
    expect(await isSafeLocalOrExternalUrl('https://api.example.com/data')).toBe(true);
  });

  it('allows RFC1918 10/8 hosts — the whole point of the relaxed check', async () => {
    // homeassistant.local style — literal private IP
    expect(await isSafeLocalOrExternalUrl('http://10.0.0.5:8123/api/')).toBe(true);
  });

  it('allows RFC1918 192.168/16 hosts', async () => {
    expect(await isSafeLocalOrExternalUrl('http://192.168.1.50:8123/api/config')).toBe(true);
  });

  it('allows RFC1918 172.16/12 hosts', async () => {
    expect(await isSafeLocalOrExternalUrl('http://172.20.10.5:8123/')).toBe(true);
  });

  it('allows link-local / APIPA (169.254.x.x) EXCEPT the metadata IP', async () => {
    expect(await isSafeLocalOrExternalUrl('http://169.254.10.5/')).toBe(true);
    expect(await isSafeLocalOrExternalUrl('http://169.254.1.1/')).toBe(true);
  });

  it('allows mDNS-style hostname resolving to a private IP', async () => {
    // The whole point: homeassistant.local usually resolves to 192.168.x.x
    mockResolve(['192.168.1.50']);
    expect(await isSafeLocalOrExternalUrl('http://homeassistant.local:8123/api/')).toBe(true);
  });

  it('allows IPv6 ULA (fc00::/7) — HA over IPv6 LAN', async () => {
    mockResolve(['fd12:3456:789a::1']);
    expect(await isSafeLocalOrExternalUrl('http://ha.v6.local/')).toBe(true);
  });

  // ── Allowed because localNetwork means "trusted local box too" ──────────

  it('allows loopback 127/8 — single-box installs (HA + HS on same host)', async () => {
    expect(await isSafeLocalOrExternalUrl('http://127.0.0.1:8123/')).toBe(true);
    expect(await isSafeLocalOrExternalUrl('http://localhost:8123/')).toBe(true);
  });

  it('allows IPv6 loopback ::1', async () => {
    expect(await isSafeLocalOrExternalUrl('http://[::1]:8123/')).toBe(true);
    mockResolve(['::1']);
    expect(await isSafeLocalOrExternalUrl('http://v6loop.example/')).toBe(true);
  });

  // ── Still blocked even with the relaxed check ────────────────────────────

  it('still blocks AWS/GCP/Azure metadata 169.254.169.254', async () => {
    expect(await isSafeLocalOrExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('still blocks public hostname that resolves to the metadata IP (DNS rebinding)', async () => {
    mockResolve(['169.254.169.254']);
    expect(await isSafeLocalOrExternalUrl('http://evil.example/')).toBe(false);
  });

  it('still blocks AWS IPv6 metadata', async () => {
    mockResolve(['fd00:ec2::254']);
    expect(await isSafeLocalOrExternalUrl('http://v6meta.example/')).toBe(false);
  });

  it('still blocks non-http protocols', async () => {
    expect(await isSafeLocalOrExternalUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeLocalOrExternalUrl('ftp://192.168.1.1/')).toBe(false);
  });

  it('returns false on DNS failure (same posture as strict check)', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
    expect(await isSafeLocalOrExternalUrl('http://nonexistent.local/')).toBe(false);
  });

  it('re-validates every resolved address (multi-A response)', async () => {
    // First public, second is the cloud metadata IP — must reject
    mockResolve(['8.8.8.8', '169.254.169.254']);
    expect(await isSafeLocalOrExternalUrl('http://mixed.example/')).toBe(false);
  });
});

describe('checkedLookup (the check a connection makes for itself)', () => {
  type Answer = { err: NodeJS.ErrnoException | null; address?: unknown; family?: number };

  function resolveWith(rule: AddressRule, hostname: string, options: { all?: boolean; family?: number } = {}): Promise<Answer> {
    return new Promise((resolve) => {
      checkedLookup(rule)(hostname, options, ((err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => {
        resolve({ err, address, family });
      }) as never);
    });
  }

  const answers = (...addresses: string[]) =>
    vi.spyOn(dns, 'lookup').mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never);

  it('hands a public address to the connection', async () => {
    answers('93.184.216.34');
    expect(await resolveWith('public', 'example.com')).toEqual({ err: null, address: '93.184.216.34', family: 4 });
  });

  it('hands back the whole list when the connection asks for all of them', async () => {
    answers('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946');
    const { err, address } = await resolveWith('public', 'example.com', { all: true });
    expect(err).toBeNull();
    expect(address).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it.each(['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:7f00:1'])(
    'refuses %s under the public rule',
    async (address) => {
      answers(address);
      const { err, address: handed } = await resolveWith('public', 'rebind.example.com');
      expect(isAddressBlockedError(err)).toBe(true);
      expect(handed).toBeUndefined();
    },
  );

  it('refuses a name with one private address among public ones, rather than picking a good one', async () => {
    answers('93.184.216.34', '10.0.0.5');
    expect(isAddressBlockedError((await resolveWith('public', 'mixed.example.com', { all: true })).err)).toBe(true);
  });

  it.each(['127.0.0.1', '192.168.1.1', '169.254.10.10', 'fd12::5'])('lets %s through under the home-network rule', async (address) => {
    answers(address);
    expect((await resolveWith('home-network', 'nas.example.com')).err).toBeNull();
  });

  it.each(['169.254.169.254', '0.0.0.0', '::', 'fd00:ec2::254', '::ffff:a9fe:a9fe'])(
    'still refuses %s under the home-network rule',
    async (address) => {
      answers(address);
      expect(isAddressBlockedError((await resolveWith('home-network', 'meta.example.com')).err)).toBe(true);
    },
  );

  it('judges the second answer on its own: public for the check, private for the connection', async () => {
    vi.spyOn(dns, 'lookup')
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    expect(await isSafeExternalUrl('https://rebind.example.com/')).toBe(true);
    expect(isAddressBlockedError((await resolveWith('public', 'rebind.example.com')).err)).toBe(true);
  });

  it('passes a name that does not resolve on as the failure it is', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    const { err } = await resolveWith('public', 'nowhere.example.com');
    expect(err?.code).toBe('ENOTFOUND');
    expect(isAddressBlockedError(err)).toBe(false);
  });

  it('refuses a name that resolves to nothing', async () => {
    answers();
    expect(isAddressBlockedError((await resolveWith('public', 'empty.example.com')).err)).toBe(true);
  });

  it('asks for the address family the connection wants', async () => {
    const lookup = answers('93.184.216.34');
    await resolveWith('public', 'example.com', { family: 4 });
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true, family: 4 });
  });
});

describe('isAddressBlockedError', () => {
  it('finds the refusal under the wrapping a fetch puts around it', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    const refusal = await new Promise<Error | null>((resolve) => {
      checkedLookup('public')('rebind.example.com', {}, ((err: Error | null) => resolve(err)) as never);
    });
    expect(isAddressBlockedError(new TypeError('fetch failed', { cause: refusal }))).toBe(true);
    expect(isAddressBlockedError(new TypeError('fetch failed', { cause: new AggregateError([new Error('x'), refusal!]) }))).toBe(true);
  });

  it('says no to everything else', () => {
    expect(isAddressBlockedError(new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }))).toBe(false);
    expect(isAddressBlockedError('EADDRBLOCKED')).toBe(false);
    expect(isAddressBlockedError(undefined)).toBe(false);
  });
});
