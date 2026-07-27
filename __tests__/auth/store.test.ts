import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  sql: Object.assign(mockSql, { raw: vi.fn() }),
}))

import {
  saveNonce,
  hasActiveNonce,
  consumeNonce,
  storeRefreshToken,
  revokeRefreshToken,
  touchRefreshToken,
  findValidRefreshToken,
  rotateRefreshToken,
} from '@/lib/auth/store'

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveNonce', () => {
    it('inserts a nonce record', async () => {
      mockSql.mockResolvedValue([])
      await saveNonce({
        walletAddress: 'GABC',
        nonceHash: 'hash123',
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      })
      expect(mockSql).toHaveBeenCalledTimes(1)
    })
  })

  describe('hasActiveNonce', () => {
    it('returns true when nonce exists', async () => {
      mockSql.mockResolvedValue([{ id: 1 }])
      const result = await hasActiveNonce({
        walletAddress: 'GABC',
        nonceHash: 'hash123',
      })
      expect(result).toBe(true)
    })

    it('returns false when nonce does not exist', async () => {
      mockSql.mockResolvedValue([])
      const result = await hasActiveNonce({
        walletAddress: 'GABC',
        nonceHash: 'hash123',
      })
      expect(result).toBe(false)
    })
  })

  describe('consumeNonce', () => {
    it('returns true when nonce consumed', async () => {
      mockSql.mockResolvedValue([{ id: 1 }])
      const result = await consumeNonce({
        walletAddress: 'GABC',
        nonceHash: 'hash123',
      })
      expect(result).toBe(true)
    })

    it('returns false when nonce not found', async () => {
      mockSql.mockResolvedValue([])
      const result = await consumeNonce({
        walletAddress: 'GABC',
        nonceHash: 'hash123',
      })
      expect(result).toBe(false)
    })
  })

  describe('storeRefreshToken', () => {
    it('inserts a refresh token record', async () => {
      mockSql.mockResolvedValue([])
      await storeRefreshToken({
        walletAddress: 'GABC',
        jti: 'jti-123',
        tokenHash: 'hash',
        expiresAt: new Date('2026-01-01'),
        userAgent: 'Mozilla/5.0',
        ipAddress: '1.2.3.4',
      })
      expect(mockSql).toHaveBeenCalledTimes(1)
    })

    it('handles null userAgent and ipAddress', async () => {
      mockSql.mockResolvedValue([])
      await storeRefreshToken({
        walletAddress: 'GABC',
        jti: 'jti-123',
        tokenHash: 'hash',
        expiresAt: new Date('2026-01-01'),
        userAgent: null,
        ipAddress: null,
      })
      expect(mockSql).toHaveBeenCalledTimes(1)
    })
  })

  describe('revokeRefreshToken', () => {
    it('revokes a token by jti', async () => {
      mockSql.mockResolvedValue([])
      await revokeRefreshToken({ jti: 'jti-123' })
      expect(mockSql).toHaveBeenCalledTimes(1)
    })

    it('revokes with replacedByJti', async () => {
      mockSql.mockResolvedValue([])
      await revokeRefreshToken({ jti: 'jti-old', replacedByJti: 'jti-new' })
      expect(mockSql).toHaveBeenCalledTimes(1)
    })
  })

  describe('touchRefreshToken', () => {
    it('updates last_used_at', async () => {
      mockSql.mockResolvedValue([])
      await touchRefreshToken('jti-123')
      expect(mockSql).toHaveBeenCalledTimes(1)
    })
  })

  describe('findValidRefreshToken', () => {
    it('returns true when valid token found', async () => {
      mockSql.mockResolvedValue([{ id: 1 }])
      const result = await findValidRefreshToken({
        walletAddress: 'GABC',
        jti: 'jti-123',
        tokenHash: 'hash',
      })
      expect(result).toBe(true)
    })

    it('returns false when no valid token found', async () => {
      mockSql.mockResolvedValue([])
      const result = await findValidRefreshToken({
        walletAddress: 'GABC',
        jti: 'jti-123',
        tokenHash: 'hash',
      })
      expect(result).toBe(false)
    })
  })

  describe('rotateRefreshToken', () => {
    it('returns true when rotation succeeded', async () => {
      mockSql.mockResolvedValue([{ rotated: '1' }])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: 'Mozilla',
        ipAddress: '1.2.3.4',
      })
      expect(result).toBe(true)
    })

    it('returns false when rotation failed', async () => {
      mockSql.mockResolvedValue([{ rotated: '0' }])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: null,
        ipAddress: null,
      })
      expect(result).toBe(false)
    })

    it('returns false when no rows returned', async () => {
      mockSql.mockResolvedValue([])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: 'test',
        ipAddress: '1.2.3.4',
      })
      expect(result).toBe(false)
    })

    it('returns false when rotated is numeric 0', async () => {
      mockSql.mockResolvedValue([{ rotated: 0 }])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: 'test',
        ipAddress: '1.2.3.4',
      })
      expect(result).toBe(false)
    })

    it('returns false when rotated is numeric 1 with count > 1', async () => {
      mockSql.mockResolvedValue([{ rotated: 2 }])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: 'test',
        ipAddress: '1.2.3.4',
      })
      expect(result).toBe(false)
    })

    it('returns true when rotated is numeric 1', async () => {
      mockSql.mockResolvedValue([{ rotated: 1 }])
      const result = await rotateRefreshToken({
        walletAddress: 'GABC',
        currentJti: 'old-jti',
        currentTokenHash: 'old-hash',
        newJti: 'new-jti',
        newTokenHash: 'new-hash',
        newExpiresAt: new Date('2026-01-01'),
        userAgent: 'test',
        ipAddress: '1.2.3.4',
      })
      expect(result).toBe(true)
    })
  })
})
