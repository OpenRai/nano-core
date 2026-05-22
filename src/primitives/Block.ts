import { NanoAddress } from './NanoAddress.js';

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
