import { describe, expect, it } from 'vitest';
import * as nanocurrency from 'nanocurrency';
import { NanoAddress } from './NanoAddress.js';

const ADDRESS = 'nano_1111111111111111111111111111111111111111111111111111hifc8npp';

describe('NanoAddress', () => {
  it('parses canonical and legacy addresses with a matching public key', () => {
    const canonical = NanoAddress.parse(ADDRESS);
    const legacy = NanoAddress.parse(ADDRESS.replace('nano_', 'xrb_'));

    expect(canonical.toString()).toBe(ADDRESS);
    expect(legacy.toString()).toBe(ADDRESS.replace('nano_', 'xrb_'));
    expect(canonical.publicKey).toBe(nanocurrency.derivePublicKey(ADDRESS));
    expect(legacy.publicKey).toBe(canonical.publicKey);
  });

  it('round-trips its JSON representation', () => {
    const address = NanoAddress.parse(ADDRESS);

    expect(address.toJSON()).toBe(ADDRESS);
    expect(JSON.stringify({ address })).toBe(`{"address":"${ADDRESS}"}`);
  });

  it('rejects malformed and checksum-invalid addresses', () => {
    expect(() => NanoAddress.parse('nano_invalid')).toThrow('Invalid Nano address');
    expect(() => NanoAddress.parse(`${ADDRESS.slice(0, -1)}q`)).toThrow('Invalid Nano address');
  });
});
