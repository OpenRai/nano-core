import blake from 'blakejs';
import * as nanocurrency from 'nanocurrency';

const { blake2bHex } = blake;

const MAGIC_HEADER_TEXT = '\x18Nano Off-chain Message:\n';
const MAGIC_HEADER_BYTES = new TextEncoder().encode(MAGIC_HEADER_TEXT);

/**
 * Nano Off-chain Message Signing (NOMS) implementation (ORIS-001).
 */
export const NOMS = {
  /**
   * Constructs the binary payload for an off-chain message as per ORIS-001.
   * Format: MAGIC_HEADER (25 bytes) || MESSAGE_LENGTH (4 bytes uint32be) || MESSAGE (UTF-8)
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
   * Computes the 32-byte Blake2b hash of the NOMS payload.
   */
  hashMessage(message: string): string {
    const payload = this.createPayload(message);
    return blake2bHex(payload, undefined, 32);
  },

  /**
   * Signs an off-chain message using standard Nano Ed25519 behavior.
   * @param message The UTF-8 string message to sign.
   * @param secretKey The 32-byte private key in hexadecimal format.
   * @returns The 64-byte signature in hexadecimal format (128 characters).
   */
  signMessage(message: string, secretKey: string): string {
    const hash = this.hashMessage(message);
    return nanocurrency.signBlock({ hash, secretKey }).toLowerCase();
  },

  /**
   * Verifies an off-chain message signature against a public key.
   * @param message The UTF-8 string message that was signed.
   * @param signature The 64-byte signature in hexadecimal format.
   * @param publicKey The 32-byte public key in hexadecimal format.
   * @returns True if the signature is valid for the given message and public key.
   */
  verifyMessage(message: string, signature: string, publicKey: string): boolean {
    const hash = this.hashMessage(message);
    return nanocurrency.verifyBlock({ hash, signature, publicKey });
  },
};
