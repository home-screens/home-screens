import { describe, it, expect } from 'vitest';
import net from 'net';
import { cidrFault, isIPv4Text } from '../cidr';

describe('cidrFault', () => {
  it.each(['192.168.1.1', '192.168.1.0/24', '10.0.0.1/32', '0.0.0.0/0'])('accepts %s', (entry) => {
    expect(cidrFault(entry)).toBeNull();
  });

  it.each([
    ['999.999.999.999', 'address'],
    ['999.300.1.1', 'address'],
    ['', 'address'],
    ['not-an-ip', 'address'],
    ['192.168.1', 'address'],
    ['192.168.1.0/abc', 'prefix'],
    ['192.168.1.0/33', 'prefix'],
    ['192.168.1.0/-1', 'prefix'],
    ['10.0.0.0/08', 'prefix'],
    ['10.0.0.0/', 'prefix'],
    ['192.168.1.0/24/8', 'format'],
  ] as const)('refuses %s for its %s', (entry, fault) => {
    expect(cidrFault(entry)).toBe(fault);
  });
});

describe('isIPv4Text', () => {
  it("agrees with Node's own check, which the matcher uses", () => {
    const samples = [
      '0.0.0.0', '255.255.255.255', '256.1.1.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.04',
      '1.2.3.', '.1.2.3', '1..2.3', ' 1.2.3.4', '1.2.3.4 ', '1.2.3.a', '1e1.2.3.4', '+1.2.3.4',
      '192.168.86.143', '', '::1', '0x10.1.1.1', '1.2.3.-4', '1.2.3.1000',
    ];
    for (const sample of samples) {
      expect([sample, isIPv4Text(sample)]).toEqual([sample, net.isIPv4(sample)]);
    }
  });
});
