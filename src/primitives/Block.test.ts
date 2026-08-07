import { describe, expect, it } from 'vitest';
import {
  createBlock,
  deriveAddress,
  derivePublicKey,
  deriveSecretKey,
} from 'nanocurrency';
import {
  buildChangeBlock,
  buildReceiveBlock,
  buildSendBlock,
  hashStateBlock,
  serializeStateBlock,
  stateBlockSigningPayload,
} from './Block.js';

const SEED = '0'.repeat(64);
const SECRET = deriveSecretKey(SEED, 0);
const ACCOUNT = deriveAddress(derivePublicKey(SECRET));
const DESTINATION = deriveAddress(derivePublicKey(deriveSecretKey(SEED, 1)));
const PREVIOUS = 'A'.repeat(64);
const SOURCE = 'B'.repeat(64);

describe('state block construction', () => {
  it('builds a send with the resulting balance and destination public key', () => {
    const block = buildSendBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: ACCOUNT,
      currentBalanceRaw: '100',
      amountRaw: '25',
      destination: DESTINATION,
    });

    expect(block.balance).toBe('75');
    expect(block.link).toBe(derivePublicKey(DESTINATION));
    expect(serializeStateBlock(block)).toHaveLength(176);
    expect(stateBlockSigningPayload(block)).toHaveLength(352);

    const reference = createBlock(SECRET, {
      previous: PREVIOUS,
      representative: ACCOUNT,
      balance: '75',
      link: DESTINATION,
      work: null,
    });
    expect(hashStateBlock(block)).toBe(reference.hash);
  });

  it('builds receive/open and representative-change blocks', () => {
    const receive = buildReceiveBlock({
      account: ACCOUNT,
      representative: ACCOUNT,
      currentBalanceRaw: '0',
      amountRaw: '25',
      sourceHash: SOURCE,
    });
    expect(receive.previous).toBe('0'.repeat(64));
    expect(receive.balance).toBe('25');

    const change = buildChangeBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: DESTINATION,
      balanceRaw: '25',
    });
    expect(change.link).toBe('0'.repeat(64));
    expect(change.balance).toBe('25');
  });

  it('rejects invalid amounts before signing', () => {
    expect(() => buildSendBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: ACCOUNT,
      currentBalanceRaw: '10',
      amountRaw: '11',
      destination: DESTINATION,
    })).toThrow('exceeds current balance');

    expect(() => buildReceiveBlock({
      account: ACCOUNT,
      representative: ACCOUNT,
      currentBalanceRaw: '0',
      amountRaw: '0',
      sourceHash: SOURCE,
    })).toThrow('greater than zero');
  });
});
