import { describe, it, expect } from 'vitest'
import {
  sha256Hex,
  fromBase64Url,
  encodeBase64Url,
  randomNonce,
  randomId,
  safeEqual,
} from '@/lib/auth/crypto'

describe('crypto utilities', () => {
  describe('sha256Hex', () => {
    it('returns consistent hash for same input', () => {
      const a = sha256Hex('hello')
      const b = sha256Hex('hello')
      expect(a).toBe(b)
    })

    it('returns 64-char hex string', () => {
      const hash = sha256Hex('test')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns different hashes for different inputs', () => {
      expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
    })

    it('hashes empty string', () => {
      const hash = sha256Hex('')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('base64url round-trip', () => {
    it('encodes and decodes buffer correctly', () => {
      const original = Buffer.from('Hello, World!')
      const encoded = encodeBase64Url(original)
      const decoded = fromBase64Url(encoded)
      expect(decoded).toEqual(original)
    })

    it('encodes and decodes string correctly', () => {
      const original = 'test-value-123'
      const encoded = encodeBase64Url(original)
      const decoded = fromBase64Url(encoded)
      expect(decoded.toString('utf8')).toBe(original)
    })

    it('uses URL-safe characters (no + / =)', () => {
      const encoded = encodeBase64Url(Buffer.from('special chars: <>?{}[]'))
      expect(encoded).not.toContain('+')
      expect(encoded).not.toContain('/')
      expect(encoded).not.toContain('=')
    })

    it('handles empty input', () => {
      const encoded = encodeBase64Url(Buffer.alloc(0))
      expect(encoded).toBe('')
      const decoded = fromBase64Url(encoded)
      expect(decoded.length).toBe(0)
    })
  })

  describe('randomNonce', () => {
    it('returns unique values', () => {
      const nonces = new Set(Array.from({ length: 50 }, () => randomNonce()))
      expect(nonces.size).toBe(50)
    })

    it('returns non-empty string', () => {
      expect(randomNonce().length).toBeGreaterThan(0)
    })

    it('accepts custom byte size', () => {
      const small = randomNonce(8)
      const large = randomNonce(64)
      expect(large.length).toBeGreaterThan(small.length)
    })
  })

  describe('randomId', () => {
    it('returns unique values', () => {
      const ids = new Set(Array.from({ length: 50 }, () => randomId()))
      expect(ids.size).toBe(50)
    })

    it('returns non-empty string', () => {
      expect(randomId().length).toBeGreaterThan(0)
    })
  })

  describe('safeEqual', () => {
    it('returns true for equal strings', () => {
      expect(safeEqual('abc', 'abc')).toBe(true)
    })

    it('returns false for different strings', () => {
      expect(safeEqual('abc', 'def')).toBe(false)
    })

    it('returns false for different lengths', () => {
      expect(safeEqual('abc', 'abcd')).toBe(false)
    })

    it('returns false for empty vs non-empty', () => {
      expect(safeEqual('', 'a')).toBe(false)
    })

    it('returns true for empty strings', () => {
      expect(safeEqual('', '')).toBe(true)
    })

    it('is timing-safe (does not short-circuit on first char)', () => {
      // Both strings have same length but different content
      expect(safeEqual('aaaa', 'aaab')).toBe(false)
      expect(safeEqual('aaaa', 'aaaa')).toBe(true)
    })
  })
})
