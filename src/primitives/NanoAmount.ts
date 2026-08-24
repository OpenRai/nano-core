import type { RawAmountString } from './types.js';

const MAX_UINT128 = (1n << 128n) - 1n;

/**
 * Precision-safe representation of a Nano currency value.
 *
 * Internally stores balances in integer `raw` units (1 Nano = 10^30 raw = 10^24 raw per micronano).
 * Valid range: 0 to 2^128 - 1 raw (340,282,366,920,938,463,463,374,607,431,768,211,455 raw).
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#units
 */
export class NanoAmount {
  private readonly _raw: RawAmountString;

  private constructor(rawAsStr: string) {
    if (!/^\d+$/.test(rawAsStr)) {
      throw new Error(`Invalid raw amount: ${rawAsStr}`);
    }
    if (BigInt(rawAsStr) > MAX_UINT128) {
      throw new Error("Raw amount exceeds Nano's uint128 balance range");
    }
    this._raw = rawAsStr as RawAmountString;
  }

  /**
   * Instantiates a `NanoAmount` from an exact decimal integer string of raw units.
   *
   * @param raw - Integer string of raw units (0 <= raw <= 2^128 - 1)
   * @returns Validated `NanoAmount` instance
   * @throws {Error} If raw contains non-digit characters or exceeds uint128 maximum
   */
  public static fromRaw(raw: string | RawAmountString): NanoAmount {
    return new NanoAmount(raw);
  }

  /**
   * Instantiates a `NanoAmount` from a human-readable decimal Nano amount string.
   *
   * @param amount - Non-negative decimal string with at most 30 decimal places (e.g. "1.5" or "0.000001")
   * @returns Validated `NanoAmount` instance
   * @throws {Error} If amount is negative, formatted incorrectly, or exceeds 30 decimal places
   */
  public static fromNano(amount: string): NanoAmount {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,30})?$/.test(amount)) {
      throw new Error('Nano amount must be a non-negative decimal string with at most 30 decimal places');
    }

    const [whole, fraction = ''] = amount.split('.');
    const rawBigInt = BigInt(`${whole}${fraction.padEnd(30, '0')}`);
    return new NanoAmount(rawBigInt.toString());
  }

  /**
   * Returns the exact value in raw integer units.
   */
  public get raw(): RawAmountString {
    return this._raw;
  }

  /**
   * Returns human-readable Nano decimal representation without trailing zeros.
   */
  public get nano(): string {
    const rawStr = this._raw.padStart(31, '0');
    const whole = rawStr.slice(0, rawStr.length - 30);
    const fraction = rawStr.slice(rawStr.length - 30).replace(/0+$/, '');
    return fraction.length > 0 ? `${whole}.${fraction}` : whole;
  }

  /**
   * Formats the amount as a human-readable Nano string.
   */
  public toString(): string {
    return this.nano;
  }

  /**
   * Serializes the amount to its exact raw string value for JSON.
   */
  public toJSON(): RawAmountString {
    return this.raw;
  }
}
