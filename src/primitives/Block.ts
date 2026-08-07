import { NanoAddress } from './NanoAddress.js';
import { blake2b } from 'blakejs';

export type BlockSubtype = 'send' | 'receive' | 'open' | 'change';

export interface StateBlock {
  type: 'state';
  account: string;
  previous: string;
  representative: string;
  balance: string;
  link: string;
  signature?: string;
  work?: string;
}

export interface SendBlockWithPoW extends StateBlock {
  work: string;
}

export interface ReceiveBlockWithPoW extends StateBlock {
  work: string;
}

export interface OpenBlockWithPoW extends StateBlock {
  work: string;
}

export interface ChangeBlockWithPoW extends StateBlock {
  work: string;
}

export type BlockWithPoW = SendBlockWithPoW | ReceiveBlockWithPoW | OpenBlockWithPoW | ChangeBlockWithPoW;

const ZERO_HASH = '0'.repeat(64);
const STATE_BLOCK_PREAMBLE = `${'0'.repeat(62)}06`;
const MAX_UINT128 = (1n << 128n) - 1n;

export interface BuildSendBlockInput {
  account: string;
  previous: string;
  representative: string;
  currentBalanceRaw: string;
  amountRaw: string;
  destination: string;
}

export interface BuildReceiveBlockInput {
  account: string;
  previous?: string;
  representative: string;
  currentBalanceRaw: string;
  amountRaw: string;
  sourceHash: string;
}

export interface BuildChangeBlockInput {
  account: string;
  previous: string;
  representative: string;
  balanceRaw: string;
}

function assertHash(value: string, field: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${field} must be a 64-character hexadecimal string`);
  }
  return value.toUpperCase();
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
    balance: (current - amount).toString(),
    link: NanoAddress.parse(input.destination).publicKey.toUpperCase(),
  };
}

export function buildReceiveBlock(input: BuildReceiveBlockInput): StateBlock {
  const current = parseRaw(input.currentBalanceRaw, 'currentBalanceRaw');
  const amount = parseRaw(input.amountRaw, 'amountRaw');
  if (amount === 0n) throw new Error('amountRaw must be greater than zero');
  const balance = current + amount;
  if (balance > MAX_UINT128) throw new Error('resulting balance exceeds Nano\'s uint128 balance range');

  return {
    type: 'state',
    account: NanoAddress.parse(input.account).toString(),
    previous: assertHash(input.previous ?? ZERO_HASH, 'previous'),
    representative: NanoAddress.parse(input.representative).toString(),
    balance: balance.toString(),
    link: assertHash(input.sourceHash, 'sourceHash'),
  };
}

export function buildChangeBlock(input: BuildChangeBlockInput): StateBlock {
  parseRaw(input.balanceRaw, 'balanceRaw');
  return {
    type: 'state',
    account: NanoAddress.parse(input.account).toString(),
    previous: assertHash(input.previous, 'previous'),
    representative: NanoAddress.parse(input.representative).toString(),
    balance: input.balanceRaw,
    link: ZERO_HASH,
  };
}

/** Serialize the signable 176-byte Nano state-block payload. */
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

export function stateBlockSigningPayload(block: StateBlock): string {
  return Array.from(serializeStateBlock(block), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function hashStateBlock(block: StateBlock): string {
  return blake2b(serializeStateBlock(block), undefined, 32)
    .reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
    .toUpperCase();
}

/**
 * Gets the Proof of Work root hash for a given state block and subtype.
 */
export function getWorkRoot(block: StateBlock, subtype: BlockSubtype, accountPublicKey?: string): string {
  if (subtype === 'open') {
    if (accountPublicKey) {
      return accountPublicKey.toLowerCase();
    }
    return NanoAddress.parse(block.account).publicKey.toLowerCase();
  }
  return block.previous.toLowerCase();
}
