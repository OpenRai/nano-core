const MAX_UINT128 = (1n << 128n) - 1n;

export class NanoAmount {
  private readonly _raw: string;

  private constructor(rawAsStr: string) {
    if (!/^\d+$/.test(rawAsStr)) {
      throw new Error(`Invalid raw amount: ${rawAsStr}`);
    }
    if (BigInt(rawAsStr) > MAX_UINT128) {
      throw new Error('Raw amount exceeds Nano\'s uint128 balance range');
    }
    this._raw = rawAsStr;
  }

  public static fromRaw(raw: string): NanoAmount {
    return new NanoAmount(raw);
  }

  /** Initialize from an exact human-readable Nano decimal string. */
  public static fromNano(amount: string): NanoAmount {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,30})?$/.test(amount)) {
      throw new Error('Nano amount must be a non-negative decimal string with at most 30 decimal places');
    }

    const [whole, fraction = ''] = amount.split('.');
    const rawBigInt = BigInt(`${whole}${fraction.padEnd(30, '0')}`);
    return new NanoAmount(rawBigInt.toString());
  }

  public get raw(): string {
    return this._raw;
  }
  
  public get nano(): string {
    let rawStr = this._raw.padStart(31, '0');
    const whole = rawStr.slice(0, rawStr.length - 30);
    const fraction = rawStr.slice(rawStr.length - 30).replace(/0+$/, '');
    return fraction.length > 0 ? `${whole}.${fraction}` : whole;
  }

  public toString(): string {
    return this.nano;
  }

  public toJSON(): string {
    return this.raw;
  }
}
