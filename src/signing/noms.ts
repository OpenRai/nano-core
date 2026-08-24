import blake from 'blakejs';
import * as nanocurrency from 'nanocurrency';
import type { HashString, PrivateKeyString, PublicKeyString, SignatureString } from '../primitives/types.js';

const { blake2bHex } = blake;

const MAGIC_HEADER_TEXT = '\x18Nano Off-chain Message:\n';
const MAGIC_HEADER_BYTES = new TextEncoder().encode(MAGIC_HEADER_TEXT);

/**
 * Nano Off-chain Message Signing (NOMS) implementation (ORIS-001 standard).
 *
 * Provides cryptographic message attestation and signature verification using Nano's Ed25519 scheme
 * with domain separation to prevent cross-protocol signature collisions with state blocks.
 */
export const NOMS = {
  /**
   * Constructs the canonical binary payload for an off-chain message under ORIS-001.
   * Binary layout: MAGIC_HEADER (25 bytes) || MESSAGE_LENGTH (4 bytes uint32 Big-Endian) || MESSAGE (UTF-8 bytes).
   *
   * @param message - UTF-8 string message to envelope
   * @returns Serialized binary payload `Uint8Array`
   */
  createPayload(message: string): Uint8Array {
    const messageBytes = new TextEncoder().encode(message);
    const lengthBytes = new Uint8Array(4);
    new DataView(lengthBytes.buffer).setUint32(0, messageBytes.length, false);

    const payload = new Uint8Array(MAGIC_HEADER_BYTES.length + lengthBytes.length + messageBytes.length);
    payload.set(MAGIC_HEADER_BYTES, 0);
    payload.set(lengthBytes, MAGIC_HEADER_BYTES.length);
    payload.set(messageBytes, MAGIC_HEADER_BYTES.length + lengthBytes.length);

    return payload;
  },

  /**
   * Computes the 32-byte Blake2b hash (64 hex characters) of a NOMS enveloped message.
   *
   * @param message - UTF-8 string message
   * @returns 64-character lowercase hexadecimal hash
   */
  hashMessage(message: string): HashString {
    const payload = this.createPayload(message);
    return blake2bHex(payload, undefined, 32).toLowerCase() as HashString;
  },

  /**
   * Signs an off-chain UTF-8 message using a 32-byte Ed25519 private key.
   *
   * @param message - UTF-8 string message to sign
   * @param secretKey - 64-character hexadecimal Ed25519 private key
   * @returns 128-character lowercase hexadecimal Ed25519 signature
   */
  signMessage(message: string, secretKey: string | PrivateKeyString): SignatureString {
    const hash = this.hashMessage(message);
    return nanocurrency.signBlock({ hash, secretKey }).toLowerCase() as SignatureString;
  },

  /**
   * Verifies an off-chain message Ed25519 signature against an account public key.
   *
   * @param message - UTF-8 string message
   * @param signature - 128-character hexadecimal Ed25519 signature
   * @param publicKey - 64-character hexadecimal Ed25519 public key
   * @returns True if the signature is valid for the specified message and public key
   */
  verifyMessage(
    message: string,
    signature: string | SignatureString,
    publicKey: string | PublicKeyString
  ): boolean {
    const hash = this.hashMessage(message);
    return nanocurrency.verifyBlock({ hash, signature, publicKey });
  },
};
