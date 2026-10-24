import { decryptSecret, encryptSecret, sha256Hex } from './crypto.util';

describe('crypto.util', () => {
  it('encrypts and decrypts secrets', () => {
    process.env.JWT_SECRET = 'test-secret-for-unit';
    const plain = 'glpat-super-secret-token';
    const cipher = encryptSecret(plain);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher)).toBe(plain);
  });

  it('hashes payload for webhook idempotency', () => {
    expect(sha256Hex('{"a":1}')).toHaveLength(64);
    expect(sha256Hex('a')).toBe(sha256Hex('a'));
  });
});
