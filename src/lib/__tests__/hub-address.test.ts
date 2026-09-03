import { describe, it, expect } from 'vitest';
import type os from 'os';
import { pickLanIpv4 } from '../hub-address';

type Info = os.NetworkInterfaceInfo;

function v4(address: string, internal = false): Info {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: `${address}/24` };
}
function v6(address: string, internal = false): Info {
  return { address, netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:00:00:00:00:00', internal, cidr: `${address}/64`, scopeid: 0 };
}

describe('pickLanIpv4', () => {
  it('prefers wired over Wi-Fi over anything else, and skips loopback and IPv6', () => {
    expect(pickLanIpv4({
      lo: [v4('127.0.0.1', true), v6('::1', true)],
      wlan0: [v4('192.168.1.40'), v6('fe80::1')],
      eth0: [v4('192.168.1.20')],
    })).toBe('192.168.1.20');
    expect(pickLanIpv4({
      lo: [v4('127.0.0.1', true)],
      wlan0: [v4('192.168.1.40')],
      usb0: [v4('10.42.0.1')],
    })).toBe('192.168.1.40');
  });

  it('never picks a container bridge, a tunnel, or a link-local address', () => {
    expect(pickLanIpv4({
      lo: [v4('127.0.0.1', true)],
      docker0: [v4('172.17.0.1')],
      'br-1a2b3c': [v4('172.18.0.1')],
      tailscale0: [v4('100.64.0.5')],
      eth0: [v4('169.254.10.10')],
    })).toBeNull();
    expect(pickLanIpv4({
      docker0: [v4('172.17.0.1')],
      end0: [v4('192.168.1.21')],
    })).toBe('192.168.1.21');
  });

  it('returns null with no interfaces at all', () => {
    expect(pickLanIpv4({})).toBeNull();
  });
});
