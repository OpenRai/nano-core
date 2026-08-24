import { describe, expect, it } from 'vitest';
import {
  isAccountString,
  isHashString,
  isPublicKeyString,
  isRawAmountString,
  isRootString,
  isSeedString,
  isSignatureString,
  isWorkString,
} from './types.js';

describe('primitives/types type guards', () => {
  const validAccount = 'nano_1111111111111111111111111111111111111111111111111111hifc8npp';
  const validHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const validWork = '0000000000000000';
  const validSignature = '0'.repeat(128);

  it('validates account strings accurately', () => {
    expect(isAccountString(validAccount)).toBe(true);
    expect(isAccountString(validAccount.replace('nano_', 'xrb_'))).toBe(true);
    expect(isAccountString('nano_invalid')).toBe(false);
    expect(isAccountString(`${validAccount.slice(0, -1)}q`)).toBe(false);
    expect(isAccountString(123)).toBe(false);
    expect(isAccountString(null)).toBe(false);
    expect(isAccountString({})).toBe(false);
  });

  it('validates 64-hex hash and root strings', () => {
    expect(isHashString(validHash)).toBe(true);
    expect(isRootString(validHash)).toBe(true);
    expect(isHashString('not_hex')).toBe(false);
    expect(isHashString('A'.repeat(64))).toBe(true);
    expect(isHashString(` ${validHash}`)).toBe(false);
    expect(isHashString('0'.repeat(63))).toBe(false);
    expect(isHashString('0'.repeat(65))).toBe(false);
    expect(isRootString('z'.repeat(64))).toBe(false);
  });

  it('validates raw amount strings and uint128 bounds', () => {
    expect(isRawAmountString('0')).toBe(true);
    expect(isRawAmountString('1000000000000000000000000000000')).toBe(true);
    // max uint128
    expect(isRawAmountString('340282366920938463463374607431768211455')).toBe(true);
    expect(isRawAmountString('340282366920938463463374607431768211454')).toBe(true);
    // uint128 + 1
    expect(isRawAmountString('340282366920938463463374607431768211456')).toBe(false);
    expect(isRawAmountString('0001')).toBe(true);
    expect(isRawAmountString('-1')).toBe(false);
    expect(isRawAmountString('1.5')).toBe(false);
    expect(isRawAmountString(' 1')).toBe(false);
    expect(isRawAmountString('abc')).toBe(false);
    expect(isRawAmountString(1n)).toBe(false);
  });

  it('validates 16-hex work strings', () => {
    expect(isWorkString(validWork)).toBe(true);
    expect(isWorkString('0'.repeat(15))).toBe(false);
    expect(isWorkString('0'.repeat(17))).toBe(false);
    expect(isWorkString('gggggggggggggggg')).toBe(false);
    expect(isWorkString('ABCDEF0123456789')).toBe(true);
    expect(isWorkString(null)).toBe(false);
  });

  it('validates 128-hex signatures', () => {
    expect(isSignatureString(validSignature)).toBe(true);
    expect(isSignatureString('0'.repeat(127))).toBe(false);
    expect(isSignatureString('0'.repeat(129))).toBe(false);
    expect(isSignatureString('z'.repeat(128))).toBe(false);
    expect(isSignatureString(undefined)).toBe(false);
  });

  it('validates 64-hex public keys and seeds', () => {
    expect(isPublicKeyString(validHash)).toBe(true);
    expect(isSeedString(validHash)).toBe(true);
    expect(isPublicKeyString('xyz')).toBe(false);
    expect(isPublicKeyString('f'.repeat(63))).toBe(false);
    expect(isSeedString(` ${validHash}`)).toBe(false);
  });
});
