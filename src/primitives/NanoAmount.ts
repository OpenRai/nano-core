import * as nanocurrency from 'nanocurrency';

export class NanoAmount {
  private readonly _raw: string;

  private constructor(rawAsStr: string) {
    // Basic validation to ensure string is digits only
    if (!/^\d+$/.test(rawAsStr)) {
      throw new Error(`Invalid raw amount: ${rawAsStr}`);
    }
    this._raw = rawAsStr;
  }

  /**
   * Initializes from a known "raw" string.
   */
  public static fromRaw(raw: string): NanoAmount {
    return new NanoAmount(raw);
  }

  /**
   * Initializes from a human-readable Nano decimal string/number (e.g. 0.1)
   */
  public static fromNano(amount: number | string): NanoAmount {
    // 1 NANO = 10^30 raw
    // Rather than doing floats, we use BigInt or external library.
    // Assuming nanocurrency has a convert method or similar, but
    // since it does not have a direct float -> raw method that is lossless,
    // we do basic BigDecimal manipulation.
    // For now, using a simple string math equivalent or BigInt with shifting
    // 1 XNO = 1,000,000,000,000,000,000,000,000,000,000 raw
    
    let strAmount = typeof amount === 'number' ? amount.toFixed(30).replace(/0+$/, '').replace(/\.$/, '') : amount;
    
    // Split on decimal
    const parts = strAmount.split('.');
    const whole = parts[0] || '0';
    let fraction = parts[1] || '';
    
    if (fraction.length > 30) {
      throw new Error('Precision exceeds 30 decimal places');
    }
    
    fraction = fraction.padEnd(30, '0');
    
    const rawBigInt = BigInt(whole + fraction);
    return new NanoAmount(rawBigInt.toString());
  }

  public get raw(): string {
    return this._raw;
  }
  
  public get nano(): string {
    // simple back to Nano logic
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
