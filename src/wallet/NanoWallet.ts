import * as nanocurrency from 'nanocurrency';
import type { NanoClient } from '../client.js';
import { NanoAddress } from '../primitives/NanoAddress.js';
import { NanoAmount } from '../primitives/NanoAmount.js';
import { BlockSubtype, buildSendBlock, hashStateBlock, type StateBlock } from '../primitives/Block.js';
import type { HashString, PrivateKeyString, SeedString, SignatureString, WorkString } from '../primitives/types.js';

export interface HydrateWalletOptions {
  /** Deterministic BIP-44 account index (defaults to 0). */
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

/**
 * Stateful account wallet managing deterministic key derivation, state sequencing, and block broadcasting.
 *
 * Provides serialized FIFO block submission queue to prevent frontier fork races.
 */
export class NanoWallet {
  /** Account address for this wallet instance. */
  public readonly address: NanoAddress;
  /** Derivation index of this account under the seed. */
  public readonly index: number;
  private readonly client: NanoClient;
  private readonly secretKey: PrivateKeyString;
  private tail: Promise<void> = Promise.resolve();

  private constructor(client: NanoClient, secretKey: PrivateKeyString, address: NanoAddress, index: number) {
    this.client = client;
    this.secretKey = secretKey;
    this.address = address;
    this.index = index;
  }

  /**
   * Hydrates a `NanoWallet` instance from a 64-hex master seed and optional account index.
   *
   * @param client - Initialized `NanoClient` instance providing RPC and PoW routing
   * @param seed - 64-character hexadecimal seed
   * @param options - Derivation options specifying account index (default: 0)
   * @returns Hydrated `NanoWallet` instance
   * @throws {Error} If seed format is invalid or index is negative
   */
  public static hydrate(client: NanoClient, seed: string | SeedString, options: HydrateWalletOptions = {}): NanoWallet {
    const index = validateIndex(options.index ?? 0);
    const secretKey = nanocurrency.deriveSecretKey(validateSeed(seed), index) as PrivateKeyString;
    const address = NanoAddress.parse(
      nanocurrency.deriveAddress(nanocurrency.derivePublicKey(secretKey), { useNanoPrefix: true })
    );
    return new NanoWallet(client, secretKey, address, index);
  }

  /**
   * Submits a signed send transaction block to the network through the RPC endpoint pool.
   *
   * Blocks are sequenced sequentially in FIFO order through the wallet's internal tail queue.
   * The returned block hash confirms acceptance by the RPC node; it does not confirm network election quorum.
   *
   * @param destination - Target account address receiving the funds
   * @param amount - Amount to send
   * @returns 64-character uppercase hexadecimal hash of the accepted send block
   * @throws {Error} When node account info is unreachable, balance is insufficient, or RPC rejects the block
   */
  public async send(destination: NanoAddress, amount: NanoAmount): Promise<HashString> {
    const result = this.tail.then(async () => await this.sendNow(destination, amount));
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return await result;
  }

  private async sendNow(destination: NanoAddress, amount: NanoAmount): Promise<HashString> {
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

  private async signAndWork(
    block: StateBlock
  ): Promise<StateBlock & { signature: SignatureString; work: WorkString }> {
    const hash = hashStateBlock(block);
    const signature = nanocurrency.signBlock({ hash, secretKey: this.secretKey }).toUpperCase() as SignatureString;
    const work = (await this.client.workProvider.generate(block.previous, 'send')).toUpperCase() as WorkString;
    return { ...block, signature, work };
  }
}
