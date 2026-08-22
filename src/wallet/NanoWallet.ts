import * as nanocurrency from 'nanocurrency';
import type { NanoClient } from '../client.js';
import { NanoAddress } from '../primitives/NanoAddress.js';
import { NanoAmount } from '../primitives/NanoAmount.js';
import { BlockSubtype, buildSendBlock, hashStateBlock, type StateBlock } from '../primitives/Block.js';

export interface HydrateWalletOptions {
  index?: number;
}

interface AccountInfoResponse {
  frontier: string;
  balance: string;
  representative: string;
}

interface ProcessResponse {
  hash: string;
}

function validateSeed(seed: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error('Nano seed must be a 64-character hexadecimal string');
  }
  return seed.toUpperCase();
}

function validateIndex(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('Nano account index must be a non-negative safe integer');
  }
  return index;
}

export class NanoWallet {
  public readonly address: NanoAddress;
  public readonly index: number;
  private readonly client: NanoClient;
  private readonly secretKey: string;
  private tail: Promise<void> = Promise.resolve();

  private constructor(client: NanoClient, secretKey: string, address: NanoAddress, index: number) {
    this.client = client;
    this.secretKey = secretKey;
    this.address = address;
    this.index = index;
  }

  public static hydrate(client: NanoClient, seed: string, options: HydrateWalletOptions = {}): NanoWallet {
    const index = validateIndex(options.index ?? 0);
    const secretKey = nanocurrency.deriveSecretKey(validateSeed(seed), index);
    const address = NanoAddress.parse(nanocurrency.deriveAddress(nanocurrency.derivePublicKey(secretKey), { useNanoPrefix: true }));
    return new NanoWallet(client, secretKey, address, index);
  }

  /**
   * Submit a signed send block. The returned hash means the RPC accepted the
   * block; it does not mean the block is confirmed.
   */
  public async send(destination: NanoAddress, amount: NanoAmount): Promise<string> {
    const result = this.tail.then(async () => await this.sendNow(destination, amount));
    this.tail = result.then(() => undefined, () => undefined);
    return await result;
  }

  private async sendNow(destination: NanoAddress, amount: NanoAmount): Promise<string> {
    const account = this.address.toString();
    let info: AccountInfoResponse;
    try {
      info = await this.client.rpcPool.postJson<AccountInfoResponse>({
        action: 'account_info',
        account,
        representative: 'true',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot send from ${account}: account information is unavailable (${message})`);
    }

    const block = buildSendBlock({
      account,
      previous: info.frontier,
      representative: info.representative,
      currentBalanceRaw: info.balance,
      amountRaw: amount.raw,
      destination: destination.toString(),
    });
    const signedBlock = await this.signAndWork(block);
    const expectedHash = hashStateBlock(signedBlock);
    const processed = await this.client.rpcPool.postJson<ProcessResponse>({
      action: 'process',
      json_block: 'true',
      subtype: BlockSubtype.Send,
      block: signedBlock,
    });

    if (processed.hash.toUpperCase() !== expectedHash) {
      throw new Error(`RPC returned a mismatched block hash for ${account}`);
    }
    return expectedHash;
  }

  private async signAndWork(block: StateBlock): Promise<StateBlock & { signature: string; work: string }> {
    const hash = hashStateBlock(block);
    const signature = nanocurrency.signBlock({ hash, secretKey: this.secretKey }).toUpperCase();
    const work = await this.client.workProvider.generate(block.previous, 'send');
    return { ...block, signature, work: work.toUpperCase() };
  }
}
