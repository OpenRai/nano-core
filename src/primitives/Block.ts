import { NanoAddress } from './NanoAddress.js';
import { blake2b } from 'blakejs';
import type {
  AccountString,
  HashString,
  RawAmountString,
  RootString,
  SignatureString,
  WorkString,
} from './types.js';

/**
 * Universal state block subtypes.
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#block-subtypes
 */
export const BlockSubtype = {
  Send: 'send',
  Receive: 'receive',
  Open: 'open',
  Change: 'change',
} as const;

export type BlockSubtype = (typeof BlockSubtype)[keyof typeof BlockSubtype];

/**
 * Canonical representation of a universal Nano state block.
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#state-blocks
 */
export interface StateBlock {
  type: 'state';
  /** Nano account address holding this block sequence. */
  account: string | AccountString;
  /** 64-hex hash of previous block in account sequence, or 64 zeros for open blocks. */
  previous: string | HashString;
  /** Nano account address designated as representative for voting weight. */
  representative: string | AccountString;
  /** Exact integer raw balance remaining on account after this transaction. */
  balance: string | RawAmountString;
  /** 64-hex link payload: destination public key (send), source block hash (receive/open), or 64 zeros (change). */
  link: string | HashString;
  /** Optional 128-hex Ed25519 signature over serialized state block hash. */
  signature?: string | SignatureString;
  /** Optional 16-hex proof-of-work nonce meeting network difficulty threshold. */
  work?: string | WorkString;
}

export interface SendBlockWithPoW extends StateBlock {
  work: string | WorkString;
}

export interface ReceiveBlockWithPoW extends StateBlock {
  work: string | WorkString;
}

export interface OpenBlockWithPoW extends StateBlock {
  work: string | WorkString;
}

export interface ChangeBlockWithPoW extends StateBlock {
  work: string | WorkString;
}

export type BlockWithPoW = SendBlockWithPoW | ReceiveBlockWithPoW | OpenBlockWithPoW | ChangeBlockWithPoW;

const ZERO_HASH = '0'.repeat(64) as HashString;
const STATE_BLOCK_PREAMBLE = `${'0'.repeat(62)}06`;
const MAX_UINT128 = (1n << 128n) - 1n;

export interface BuildSendBlockInput {
  /** Source account address sending funds. */
  account: string | AccountString;
  /** 64-hex hash of previous block on sender account. */
  previous: string | HashString;
  /** Representative account address. */
  representative: string | AccountString;
  /** Current balance in raw decimal string prior to deduction. */
  currentBalanceRaw: string | RawAmountString;
  /** Amount to send in raw decimal string. */
  amountRaw: string | RawAmountString;
  /** Destination account address receiving funds. */
  destination: string | AccountString;
}

export interface BuildReceiveBlockInput {
  /** Account address receiving funds. */
  account: string | AccountString;
  /** 64-hex hash of previous block on account sequence, or undefined/null for open block. */
  previous?: string | HashString;
  /** Representative account address. */
  representative: string | AccountString;
  /** Current balance in raw decimal string (0 for open block). */
  currentBalanceRaw: string | RawAmountString;
  /** Amount received in raw decimal string. */
  amountRaw: string | RawAmountString;
  /** 64-hex hash of corresponding send block creating this receivable balance. */
  sourceHash: string | HashString;
}

export interface BuildChangeBlockInput {
  /** Account address changing representative. */
  account: string | AccountString;
  /** 64-hex hash of previous block on account sequence. */
  previous: string | HashString;
  /** New representative account address. */
  representative: string | AccountString;
  /** Current account balance in raw decimal string (unchanged by representative update). */
  balanceRaw: string | RawAmountString;
}

function assertHash(value: string, field: string): HashString {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${field} must be a 64-character hexadecimal string`);
  }
  return value.toUpperCase() as HashString;
}

function parseRaw(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be an unsigned decimal string`);
  const parsed = BigInt(value);
  if (parsed > MAX_UINT128) throw new Error(`${field} exceeds Nano's uint128 balance range`);
  return parsed;
}

function balanceHex(value: string): string {
  return parseRaw(value, 'balance').toString(16).padStart(32, '0').toUpperCase();
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

/**
 * Builds an unsigned state send block with balance deduction and destination public key link.
 *
 * @param input - Block parameters
 * @returns Constructed `StateBlock` object
 * @throws {Error} If amount is zero, exceeds balance, or address/hash formats are invalid
 */
export function buildSendBlock(input: BuildSendBlockInput): StateBlock {
  const current = parseRaw(input.currentBalanceRaw, 'currentBalanceRaw');
  const amount = parseRaw(input.amountRaw, 'amountRaw');
  if (amount === 0n) throw new Error('amountRaw must be greater than zero');
  if (amount > current) throw new Error('amountRaw exceeds current balance');

  return {
    type: 'state',
    account: NanoAddress.parse(input.account).toString(),
    previous: assertHash(input.previous, 'previous'),
    representative: NanoAddress.parse(input.representative).toString(),
    balance: (current - amount).toString() as RawAmountString,
    link: NanoAddress.parse(input.destination).publicKey.toUpperCase() as HashString,
  };
}

/**
 * Builds an unsigned state receive or open block adding receivable amount to account balance.
 *
 * @param input - Block parameters
 * @returns Constructed `StateBlock` object
 * @throws {Error} If amount is zero, balance overflows uint128, or hashes are invalid
 */
export function buildReceiveBlock(input: BuildReceiveBlockInput): StateBlock {
  const current = parseRaw(input.currentBalanceRaw, 'currentBalanceRaw');
  const amount = parseRaw(input.amountRaw, 'amountRaw');
  if (amount === 0n) throw new Error('amountRaw must be greater than zero');
  const balance = current + amount;
  if (balance > MAX_UINT128) throw new Error("resulting balance exceeds Nano's uint128 balance range");

  return {
    type: 'state',
    account: NanoAddress.parse(input.account).toString(),
    previous: assertHash(input.previous ?? ZERO_HASH, 'previous'),
    representative: NanoAddress.parse(input.representative).toString(),
    balance: balance.toString() as RawAmountString,
    link: assertHash(input.sourceHash, 'sourceHash'),
  };
}

/**
 * Builds an unsigned state change block updating account voting representative without altering balance.
 *
 * @param input - Block parameters
 * @returns Constructed `StateBlock` object
 * @throws {Error} If addresses, hashes, or balance formats are invalid
 */
export function buildChangeBlock(input: BuildChangeBlockInput): StateBlock {
  parseRaw(input.balanceRaw, 'balanceRaw');
  return {
    type: 'state',
    account: NanoAddress.parse(input.account).toString(),
    previous: assertHash(input.previous, 'previous'),
    representative: NanoAddress.parse(input.representative).toString(),
    balance: input.balanceRaw as RawAmountString,
    link: ZERO_HASH,
  };
}

/**
 * Serializes the canonical 176-byte binary state block payload for hashing and signature verification.
 * Layout: 32-byte preamble (0x06) + 32-byte account + 32-byte previous + 32-byte representative + 16-byte balance + 32-byte link.
 *
 * @param block - State block to serialize
 * @returns 176-byte `Uint8Array`
 * @see https://docs.nano.org/integration-guides/the-basics/#signing-blocks
 */
export function serializeStateBlock(block: StateBlock): Uint8Array {
  const payload = [
    STATE_BLOCK_PREAMBLE,
    NanoAddress.parse(block.account).publicKey,
    assertHash(block.previous, 'previous'),
    NanoAddress.parse(block.representative).publicKey,
    balanceHex(block.balance),
    assertHash(block.link, 'link'),
  ].join('');
  return hexToBytes(payload);
}

/**
 * Returns the 176-byte state block payload serialized as an uppercase hexadecimal string.
 *
 * @param block - State block to serialize
 * @returns 352-character hex string
 */
export function stateBlockSigningPayload(block: StateBlock): string {
  return Array.from(serializeStateBlock(block), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Computes the 32-byte Blake2b hash (64 hex characters) of a state block.
 *
 * @param block - State block to hash
 * @returns 64-character uppercase hexadecimal hash
 * @see https://docs.nano.org/integration-guides/the-basics/#block-structure
 */
export function hashStateBlock(block: StateBlock): HashString {
  return blake2b(serializeStateBlock(block), undefined, 32)
    .reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
    .toUpperCase() as HashString;
}

/**
 * Derives the Proof of Work root hash for a given state block and subtype.
 * For open blocks, the root is the account public key; for all other subtypes, it is the previous block hash.
 *
 * @param block - State block
 * @param subtype - Block subtype ('send' | 'receive' | 'open' | 'change')
 * @param accountPublicKey - Optional pre-derived account public key for open blocks
 * @returns 64-character lowercase hexadecimal work root hash
 * @see https://docs.nano.org/integration-guides/work-generation/#work-root
 */
export function getWorkRoot(
  block: StateBlock,
  subtype: BlockSubtype,
  accountPublicKey?: string | HashString
): RootString {
  if (subtype === 'open') {
    if (accountPublicKey) {
      return accountPublicKey.toLowerCase() as RootString;
    }
    return NanoAddress.parse(block.account).publicKey.toLowerCase() as RootString;
  }
  return block.previous.toLowerCase() as RootString;
}
