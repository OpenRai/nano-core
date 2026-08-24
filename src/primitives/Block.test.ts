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
  getWorkRoot,
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

    const receiveReference = createBlock(SECRET, {
      previous: '0'.repeat(64),
      representative: ACCOUNT,
      balance: '25',
      link: SOURCE,
      work: null,
    });
    const changeReference = createBlock(SECRET, {
      previous: PREVIOUS,
      representative: DESTINATION,
      balance: '25',
      link: '0'.repeat(64),
      work: null,
    });

    expect(hashStateBlock(receive)).toBe(receiveReference.hash);
    expect(hashStateBlock(change)).toBe(changeReference.hash);
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

    expect(() => buildSendBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: ACCOUNT,
      currentBalanceRaw: '10',
      amountRaw: '0',
      destination: DESTINATION,
    })).toThrow('greater than zero');
  });

  it('rejects uint128 overflow and malformed block fields', () => {
    const maxUint128 = ((1n << 128n) - 1n).toString();

    expect(() => buildReceiveBlock({
      account: ACCOUNT,
      representative: ACCOUNT,
      currentBalanceRaw: maxUint128,
      amountRaw: '1',
      sourceHash: SOURCE,
    })).toThrow('resulting balance exceeds');
    expect(() => buildChangeBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: ACCOUNT,
      balanceRaw: (1n << 128n).toString(),
    })).toThrow('balanceRaw exceeds');
    expect(() => buildSendBlock({
      account: ACCOUNT,
      previous: 'invalid',
      representative: ACCOUNT,
      currentBalanceRaw: '10',
      amountRaw: '1',
      destination: DESTINATION,
    })).toThrow('previous must be a 64-character hexadecimal string');
    expect(() => buildReceiveBlock({
      account: ACCOUNT,
      representative: ACCOUNT,
      currentBalanceRaw: '0',
      amountRaw: '1',
      sourceHash: 'invalid',
    })).toThrow('sourceHash must be a 64-character hexadecimal string');
    expect(() => buildChangeBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: 'nano_invalid',
      balanceRaw: '1',
    })).toThrow('Invalid Nano address');
  });

  it('derives work roots from the account for opens and previous hash otherwise', () => {
    const open = buildReceiveBlock({
      account: ACCOUNT,
      representative: ACCOUNT,
      currentBalanceRaw: '0',
      amountRaw: '25',
      sourceHash: SOURCE,
    });
    const send = buildSendBlock({
      account: ACCOUNT,
      previous: PREVIOUS,
      representative: ACCOUNT,
      currentBalanceRaw: '100',
      amountRaw: '25',
      destination: DESTINATION,
    });
    const suppliedPublicKey = 'C'.repeat(64);

    expect(getWorkRoot(open, 'open')).toBe(derivePublicKey(ACCOUNT).toLowerCase());
    expect(getWorkRoot(open, 'open', suppliedPublicKey)).toBe(suppliedPublicKey.toLowerCase());
    expect(getWorkRoot(send, 'send')).toBe(PREVIOUS.toLowerCase());
  });
});
