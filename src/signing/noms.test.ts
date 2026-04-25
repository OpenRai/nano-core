import { describe, it, expect } from 'vitest';
import { NOMS } from './noms.js';
import * as nanocurrency from 'nanocurrency';

describe('NOMS (ORIS-001)', () => {
  const message = 'Hello Nano!';
  // MAGIC_HEADER (25) + LENGTH (4) + "Hello Nano!" (11) = 40 bytes
  
  it('should create a correctly structured payload', () => {
    const payload = NOMS.createPayload(message);
    expect(payload.length).toBe(25 + 4 + message.length);
    
    // Magic Header: \x18Nano Off-chain Message:\n
    // Hex: 18 4e 61 6e 6f 20 4f 66 66 2d 63 68 61 69 6e 20 4d 65 73 73 61 67 65 3a 0a
    expect(payload[0]).toBe(0x18);
    expect(payload[1]).toBe(0x4e); // 'N'
    expect(payload[24]).toBe(0x0a); // '\n'
    
    // Length: 11 (0x0000000b)
    expect(payload[25]).toBe(0);
    expect(payload[26]).toBe(0);
    expect(payload[27]).toBe(0);
    expect(payload[28]).toBe(11);
    
    // Message
    const decodedMessage = new TextDecoder().decode(payload.slice(29));
    expect(decodedMessage).toBe(message);
  });

  it('should generate a consistent 32-byte hash', () => {
    const hash = NOMS.hashMessage(message);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    
    const hash2 = NOMS.hashMessage(message);
    expect(hash).toBe(hash2);
    
    const differentHash = NOMS.hashMessage('Hello Nano?');
    expect(hash).not.toBe(differentHash);
  });

  it('should sign and verify a message correctly', async () => {
    const seed = await nanocurrency.generateSeed();
    const secretKey = nanocurrency.deriveSecretKey(seed, 0);
    const publicKey = nanocurrency.derivePublicKey(secretKey);
    
    const signature = NOMS.signMessage(message, secretKey);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    
    const isValid = NOMS.verifyMessage(message, signature, publicKey);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signatures', async () => {
    const seed = await nanocurrency.generateSeed();
    const secretKey = nanocurrency.deriveSecretKey(seed, 0);
    const publicKey = nanocurrency.derivePublicKey(secretKey);
    
    const signature = NOMS.signMessage(message, secretKey);
    
    // Tamper with message
    expect(NOMS.verifyMessage('Tampered message', signature, publicKey)).toBe(false);
    
    // Tamper with signature
    const tamperedSignature = signature.substring(0, 127) + (signature[127] === '0' ? '1' : '0');
    expect(NOMS.verifyMessage(message, tamperedSignature, publicKey)).toBe(false);
    
    // Wrong public key
    const otherSeed = await nanocurrency.generateSeed();
    const otherPublicKey = nanocurrency.derivePublicKey(nanocurrency.deriveSecretKey(otherSeed, 0));
    expect(NOMS.verifyMessage(message, signature, otherPublicKey)).toBe(false);
  });

  it('should match known signature for specific keypair (ORIS-001 reference)', () => {
    const secretKey = '681FD5ED71A9F81E9D29E3450F6CD8AACB87346FD21A26003389290B9D0CB173';
    const publicKey = 'D2B3C9D00FFB55E84E7979D67308A515FB07CA79E40A77EB1AAFE62881781783';
    const msg = 'Hej Nano!🥦';
    const expectedSignature = '535c745819d0f40056f3c46402b4fae4356b3a8897bde99c955d411920e740d781e6dddcbde228e8b86c4383a1003f9f315519ff73bd356f561d19865dc90f09';

    const signature = NOMS.signMessage(msg, secretKey);
    expect(signature).toBe(expectedSignature);

    const isValid = NOMS.verifyMessage(msg, signature, publicKey);
    expect(isValid).toBe(true);
  });

  it('should handle empty messages correctly', () => {
    const secretKey = '681FD5ED71A9F81E9D29E3450F6CD8AACB87346FD21A26003389290B9D0CB173';
    const msg = '';
    const expectedHash = '977a10e19a7857eefad986d73b071bbb7dad60846c7785f6d0ccffe0d7bd40b9';
    const expectedSignature = '8fca45d1490a276ac9d4376d9251df3a1069f673013c33d49f3490077066f174d7fb6795b966e1d9078952ad065f836b35cd82d402cbeb63f9ace94b2123c506';

    const payload = NOMS.createPayload(msg);
    expect(payload.length).toBe(25 + 4); // Magic + Length 0

    const hash = NOMS.hashMessage(msg);
    expect(hash).toBe(expectedHash);

    const signature = NOMS.signMessage(msg, secretKey);
    expect(signature).toBe(expectedSignature);
  });
});
