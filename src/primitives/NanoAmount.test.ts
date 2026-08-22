import { describe, expect, it } from 'vitest';
import { NanoAmount } from './NanoAmount.js';

describe('NanoAmount', () => {
  it('converts exact Nano decimals without float coercion', () => {
    const amount = NanoAmount.fromNano('1.25');

    expect(amount.raw).toBe('1250000000000000000000000000000');
    expect(amount.toString()).toBe('1.25');
  });

  it('rejects scientific notation, negative values, and excess precision', () => {
    expect(() => NanoAmount.fromNano('1e-3')).toThrow('decimal string');
    expect(() => NanoAmount.fromNano('-1')).toThrow('decimal string');
    expect(() => NanoAmount.fromNano('0.0000000000000000000000000000001')).toThrow('decimal string');
  });

  it('rejects raw values outside Nano uint128 range', () => {
    expect(() => NanoAmount.fromRaw((1n << 128n).toString())).toThrow('uint128');
  });
});
