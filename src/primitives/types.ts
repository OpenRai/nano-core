import * as nanocurrency from 'nanocurrency';

declare const BrandSymbol: unique symbol;

/**
 * Generic branded nominal type.
 * Erased at compile time; enforces strict type differentiation in TypeScript.
 */
export type Branded<T, BrandTag extends string> = T & {
  readonly [BrandSymbol]: BrandTag;
};

/**
 * 60 or 65-character Nano account address starting with `nano_` or `xrb_`.
 * Encodes a 256-bit public key and a 40-bit checksum using Crockford base32.
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#account-format
 */
export type AccountString = Branded<string, 'AccountString'>;

/**
 * 64-character hexadecimal representation of a 256-bit hash (block hash, root, etc.).
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#block-structure
 */
export type HashString = Branded<string, 'HashString'>;

/**
 * 64-character hexadecimal block hash or frontier account public key representing the work root.
 *
 * @see https://docs.nano.org/integration-guides/work-generation/#work-root
 */
export type RootString = Branded<string, 'RootString'>;

/**
 * Decimal string representing an integer amount in raw units (1 Nano = 10^30 raw).
 * Valid range: 0 to 2^128 - 1 (340,282,366,920,938,463,463,374,607,431,768,211,455 raw).
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#units
 */
export type RawAmountString = Branded<string, 'RawAmountString'>;

/**
 * 16-character hexadecimal proof-of-work nonce (64 bits).
 *
 * @see https://docs.nano.org/integration-guides/work-generation/
 */
export type WorkString = Branded<string, 'WorkString'>;

/**
 * 128-character hexadecimal Ed25519 signature over a 256-bit block or message hash.
 *
 * @see https://docs.nano.org/integration-guides/the-basics/#signatures
 */
export type SignatureString = Branded<string, 'SignatureString'>;

/**
 * 64-character hexadecimal 256-bit Ed25519 public key.
 */
export type PublicKeyString = Branded<string, 'PublicKeyString'>;

/**
 * 64-character hexadecimal 256-bit private key or seed.
 */
export type SeedString = Branded<string, 'SeedString'>;

/**
 * 64-character hexadecimal 256-bit Ed25519 private key.
 */
export type PrivateKeyString = Branded<string, 'PrivateKeyString'>;

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;
const HEX_16_REGEX = /^[0-9a-fA-F]{16}$/;
const HEX_128_REGEX = /^[0-9a-fA-F]{128}$/;
const RAW_AMOUNT_REGEX = /^\d+$/;
const MAX_UINT128 = (1n << 128n) - 1n;

/**
 * Validates whether a value is a valid Nano account address string.
 *
 * @param value - String to validate
 * @returns True if value is a valid Crockford base32 Nano address with valid checksum
 */
export function isAccountString(value: unknown): value is AccountString {
  return typeof value === 'string' && nanocurrency.checkAddress(value);
}

/**
 * Validates whether a value is a 64-character hexadecimal hash string.
 *
 * @param value - String to validate
 * @returns True if value is a 64-character hex string
 */
export function isHashString(value: unknown): value is HashString {
  return typeof value === 'string' && HEX_64_REGEX.test(value);
}

/**
 * Validates whether a value is a 64-character hexadecimal work root string.
 *
 * @param value - String to validate
 * @returns True if value is a 64-character hex string
 */
export function isRootString(value: unknown): value is RootString {
  return typeof value === 'string' && HEX_64_REGEX.test(value);
}

/**
 * Validates whether a value is a decimal integer string within uint128 bounds (0 to 2^128 - 1).
 *
 * @param value - String to validate
 * @returns True if value is a valid raw amount string
 */
export function isRawAmountString(value: unknown): value is RawAmountString {
  if (typeof value !== 'string' || !RAW_AMOUNT_REGEX.test(value)) {
    return false;
  }
  try {
    return BigInt(value) <= MAX_UINT128;
  } catch {
    return false;
  }
}

/**
 * Validates whether a value is a 16-character hexadecimal proof-of-work nonce.
 *
 * @param value - String to validate
 * @returns True if value is a 16-character hex string
 */
export function isWorkString(value: unknown): value is WorkString {
  return typeof value === 'string' && HEX_16_REGEX.test(value);
}

/**
 * Validates whether a value is a 128-character hexadecimal Ed25519 signature.
 *
 * @param value - String to validate
 * @returns True if value is a 128-character hex string
 */
export function isSignatureString(value: unknown): value is SignatureString {
  return typeof value === 'string' && HEX_128_REGEX.test(value);
}

/**
 * Validates whether a value is a 64-character hexadecimal public key.
 *
 * @param value - String to validate
 * @returns True if value is a 64-character hex string
 */
export function isPublicKeyString(value: unknown): value is PublicKeyString {
  return typeof value === 'string' && HEX_64_REGEX.test(value);
}

/**
 * Validates whether a value is a 64-character hexadecimal seed or private key.
 *
 * @param value - String to validate
 * @returns True if value is a 64-character hex string
 */
export function isSeedString(value: unknown): value is SeedString {
  return typeof value === 'string' && HEX_64_REGEX.test(value);
}
