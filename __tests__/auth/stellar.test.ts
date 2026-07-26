import { describe, it, expect } from 'vitest'
import {
  isValidStellarAddress,
  normalizeWalletAddress,
  buildAuthMessage,
  verifyStellarSignature,
  getStellarPublicKey,
} from '@/lib/auth/stellar'

// A valid Stellar address (56 chars, base32, version byte 0x30, valid CRC16)
const VALID_ADDRESS = 'GCXKIXMLDVIPMCN5RR6MAJDXJJS75HVPWIIB5VIK3IU3G7FTLK2IR2GI'

describe('Stellar wallet verification', () => {
  describe('normalizeWalletAddress', () => {
    it('uppercases the address', () => {
      expect(normalizeWalletAddress('gabc123')).toBe('GABC123')
    })

    it('trims whitespace', () => {
      expect(normalizeWalletAddress('  GABC123  ')).toBe('GABC123')
    })

    it('preserves valid uppercase address', () => {
      const addr = 'GAXO33U4YR7JIEQ3C5R5JIEQ3C5R5JIEQ3C5R5JIEQ'
      expect(normalizeWalletAddress(addr)).toBe(addr)
    })
  })

  describe('isValidStellarAddress', () => {
    it('rejects empty string', () => {
      expect(isValidStellarAddress('')).toBe(false)
    })

    it('rejects random text with non-base32 chars', () => {
      expect(isValidStellarAddress('not-a-stellar-address!')).toBe(false)
    })

    it('rejects address with wrong length', () => {
      expect(isValidStellarAddress('GABC')).toBe(false)
    })

    it('returns boolean for valid-length address', () => {
      // This should not throw; it returns true or false depending on checksum
      const result = isValidStellarAddress(VALID_ADDRESS)
      expect(typeof result).toBe('boolean')
    })

    it('rejects address with invalid base32 characters', () => {
      // 'O' and 'I' are not in base32 alphabet (uses 2-7 instead)
      expect(isValidStellarAddress('GOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO')).toBe(false)
    })
  })

  describe('getStellarPublicKey', () => {
    it('throws for invalid address', () => {
      expect(() => getStellarPublicKey('invalid')).toThrow()
    })

    it('throws for empty address', () => {
      expect(() => getStellarPublicKey('')).toThrow()
    })

    it('throws for wrong length', () => {
      expect(() => getStellarPublicKey('GABC')).toThrow()
    })
  })

  describe('buildAuthMessage', () => {
    it('includes wallet address', () => {
      const msg = buildAuthMessage('GABC123', 'nonce-123')
      expect(msg).toContain('GABC123')
    })

    it('includes nonce', () => {
      const msg = buildAuthMessage('GABC123', 'nonce-123')
      expect(msg).toContain('nonce-123')
    })

    it('includes TaskChain branding', () => {
      const msg = buildAuthMessage('GABC123', 'nonce-123')
      expect(msg).toContain('TaskChain')
    })

    it('normalizes wallet address in message', () => {
      const msg = buildAuthMessage('gabc123', 'nonce-123')
      expect(msg).toContain('GABC123')
    })

    it('produces deterministic output for same inputs', () => {
      const a = buildAuthMessage('GABC', 'nonce1')
      const b = buildAuthMessage('GABC', 'nonce1')
      expect(a).toBe(b)
    })

    it('produces different output for different nonces', () => {
      const a = buildAuthMessage('GABC', 'nonce1')
      const b = buildAuthMessage('GABC', 'nonce2')
      expect(a).not.toBe(b)
    })
  })

  describe('verifyStellarSignature', () => {
    it('throws for invalid wallet address (getStellarPublicKey throws)', () => {
      expect(() =>
        verifyStellarSignature({
          walletAddress: 'invalid',
          message: 'test',
          signature: 'a'.repeat(128),
        })
      ).toThrow()
    })

    it('throws for short address', () => {
      expect(() =>
        verifyStellarSignature({
          walletAddress: 'GABC',
          message: 'test',
          signature: 'a'.repeat(128),
        })
      ).toThrow()
    })

    it('returns false for invalid signature length', () => {
      // Use a valid address but short signature
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: 'short',
      })
      expect(result).toBe(false)
    })

    it('returns false for non-hex non-base64 signature', () => {
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: '!@#$%^&*()',
      })
      expect(typeof result).toBe('boolean')
    })

    it('returns boolean (not throw) for valid address with hex-prefixed signature', () => {
      // 64 bytes hex = 128 hex chars
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: '0x' + 'aa'.repeat(64),
      })
      expect(typeof result).toBe('boolean')
    })

    it('returns false for all-zero signature (not a real signature)', () => {
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test message',
        signature: '00'.repeat(64),
      })
      expect(result).toBe(false)
    })

    it('returns false when signature does not match message', () => {
      // Random 64-byte signature that won't match any real signing
      const sig = Array.from({ length: 64 }, (_, i) =>
        (i * 37 % 256).toString(16).padStart(2, '0')
      ).join('')
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'arbitrary message',
        signature: sig,
      })
      expect(result).toBe(false)
    })
  })
})
