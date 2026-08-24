import * as nanocurrency from 'nanocurrency';
import type { AccountString, PublicKeyString } from './types.js';

/**
 * Immutable representation of a validated Nano account address.
 *
 * Encodes a 256-bit public key and a 40-bit checksum using Crockford base32.
 * Supports both standard `nano_` and legacy `xrb_` prefixes.
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#account-format
 */
export class NanoAddress {
  private readonly _address: AccountString;

  private constructor(address: AccountString) {
    this._address = address;
  }

  /**
   * Parses and validates a Nano account address string.
   *
   * @param address - Address string to validate and parse (e.g. `nano_1111...` or `xrb_1111...`)
   * @returns Validated `NanoAddress` instance
   * @throws {Error} When address format, character set, prefix, or 40-bit checksum is invalid
   *
   * @example
   * ```ts
   * const addr = NanoAddress.parse('nano_1111111111111111111111111111111111111111111111111111hifc8npp');
   * console.log(addr.publicKey);
   * ```
   */
  public static parse(address: string | AccountString): NanoAddress {
    if (!nanocurrency.checkAddress(address)) {
      throw new Error(`Invalid Nano address: ${address}`);
    }
    return new NanoAddress(address as AccountString);
  }

  /**
   * Derives the 64-character hexadecimal Ed25519 public key from the validated address.
   */
  public get publicKey(): PublicKeyString {
    return nanocurrency.derivePublicKey(this._address) as PublicKeyString;
  }

  /**
   * Returns the validated Nano address string.
   */
  public toString(): AccountString {
    return this._address;
  }

  /**
   * Serializes the address for JSON representation.
   */
  public toJSON(): AccountString {
    return this._address;
  }
}
