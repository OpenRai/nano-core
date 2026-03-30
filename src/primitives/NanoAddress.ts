import * as nanocurrency from 'nanocurrency';

export class NanoAddress {
  private readonly _address: string;

  private constructor(address: string) {
    this._address = address;
  }

  /**
   * Parses and validates a Nano address.
   * Throws if the address format or checksum is invalid.
   */
  public static parse(address: string): NanoAddress {
    if (!nanocurrency.checkAddress(address)) {
      throw new Error(`Invalid Nano address: ${address}`);
    }
    return new NanoAddress(address);
  }

  /**
   * Derives a public key from the validated address.
   */
  public get publicKey(): string {
    return nanocurrency.derivePublicKey(this._address);
  }

  public toString(): string {
    return this._address;
  }

  public toJSON(): string {
    return this._address;
  }
}
