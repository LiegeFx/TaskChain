import { describe, it, expect } from 'vitest'
import { signSessionToken, verifySessionToken } from '@/lib/auth/jwt'
import { encodeBase64Url } from '@/lib/auth/crypto'
import { createHmac } from 'crypto'

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-chars-long'

describe('JWT session tokens', () => {
  describe('signSessionToken', () => {
    it('returns a valid JWT string', () => {
      const result = signSessionToken({
        subject: 'wallet-address',
        walletAddress: 'wallet-address',
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    })

    it('includes correct payload fields', () => {
      const result = signSessionToken({
        subject: 'GABC123',
        walletAddress: 'GABC123',
        type: 'refresh',
        expiresInSeconds: 604800,
        secret: TEST_SECRET,
      })

      expect(result.payload.sub).toBe('GABC123')
      expect(result.payload.wallet).toBe('GABC123')
      expect(result.payload.type).toBe('refresh')
      expect(result.payload.jti).toBeTruthy()
      expect(result.payload.iat).toBeGreaterThan(0)
      expect(result.payload.exp).toBeGreaterThan(result.payload.iat)
    })

    it('generates unique JTIs for each call', () => {
      const a = signSessionToken({
        subject: 'w', walletAddress: 'w', type: 'access',
        expiresInSeconds: 900, secret: TEST_SECRET,
      })
      const b = signSessionToken({
        subject: 'w', walletAddress: 'w', type: 'access',
        expiresInSeconds: 900, secret: TEST_SECRET,
      })
      expect(a.payload.jti).not.toBe(b.payload.jti)
    })

    it('sets correct expiration time', () => {
      const ttl = 120
      const result = signSessionToken({
        subject: 'w', walletAddress: 'w', type: 'access',
        expiresInSeconds: ttl, secret: TEST_SECRET,
      })
      expect(result.payload.exp - result.payload.iat).toBe(ttl)
    })
  })

  describe('verifySessionToken', () => {
    it('verifies a valid token', () => {
      const { token } = signSessionToken({
        subject: 'GABC',
        walletAddress: 'GABC',
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      const payload = verifySessionToken(token, TEST_SECRET)
      expect(payload).not.toBeNull()
      expect(payload?.wallet).toBe('GABC')
      expect(payload?.type).toBe('access')
    })

    it('rejects token signed with wrong secret', () => {
      const { token } = signSessionToken({
        subject: 'GABC',
        walletAddress: 'GABC',
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      const payload = verifySessionToken(token, 'wrong-secret-key-32-chars-long!!!!')
      expect(payload).toBeNull()
    })

    it('rejects expired token', () => {
      const { token } = signSessionToken({
        subject: 'GABC',
        walletAddress: 'GABC',
        type: 'access',
        expiresInSeconds: -10,
        secret: TEST_SECRET,
      })

      const result = verifySessionToken(token, TEST_SECRET)
      expect(result).toBeNull()
    })

    it('rejects malformed token', () => {
      expect(verifySessionToken('not.a.jwt', TEST_SECRET)).toBeNull()
      expect(verifySessionToken('', TEST_SECRET)).toBeNull()
      expect(verifySessionToken('onlytwo', TEST_SECRET)).toBeNull()
    })

    it('rejects token with tampered payload', () => {
      const { token } = signSessionToken({
        subject: 'GABC',
        walletAddress: 'GABC',
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      const parts = token.split('.')
      parts[1] = parts[1] + 'X'
      const tampered = parts.join('.')

      expect(verifySessionToken(tampered, TEST_SECRET)).toBeNull()
    })

    it('returns null when payload parts are empty', () => {
      expect(verifySessionToken('..sig', TEST_SECRET)).toBeNull()
      expect(verifySessionToken('header..', TEST_SECRET)).toBeNull()
      expect(verifySessionToken('.payload.', TEST_SECRET)).toBeNull()
    })

    it('returns null for invalid header (not HS256/JWT)', () => {
      const badHeader = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
      const payload = encodeBase64Url(JSON.stringify({
        sub: 'test', wallet: 'test', jti: 'x', type: 'access',
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900,
      }))
      const input = `${badHeader}.${payload}`
      const sig = encodeBase64Url(createHmac('sha256', TEST_SECRET).update(input).digest())
      expect(verifySessionToken(`${input}.${sig}`, TEST_SECRET)).toBeNull()
    })

    it('returns null for invalid payload structure', () => {
      const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const badPayload = encodeBase64Url(JSON.stringify({ sub: 123 }))
      const input = `${header}.${badPayload}`
      const sig = encodeBase64Url(createHmac('sha256', TEST_SECRET).update(input).digest())
      expect(verifySessionToken(`${input}.${sig}`, TEST_SECRET)).toBeNull()
    })

    it('returns null for non-object payload', () => {
      const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const badPayload = encodeBase64Url('"just-a-string"')
      const input = `${header}.${badPayload}`
      const sig = encodeBase64Url(createHmac('sha256', TEST_SECRET).update(input).digest())
      expect(verifySessionToken(`${input}.${sig}`, TEST_SECRET)).toBeNull()
    })

    it('preserves wallet address exactly', () => {
      const wallet = 'GABCDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const { token } = signSessionToken({
        subject: wallet,
        walletAddress: wallet,
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      const payload = verifySessionToken(token, TEST_SECRET)
      expect(payload?.wallet).toBe(wallet)
      expect(payload?.sub).toBe(wallet)
    })
  })

  describe('edge cases for parseJson catch (line 69)', () => {
    it('returns null when payload decodes to invalid JSON', () => {
      const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const invalidPayload = encodeBase64Url('NOT_JSON{{{')
      const signingInput = `${header}.${invalidPayload}`
      const sig = encodeBase64Url(
        require('crypto').createHmac('sha256', TEST_SECRET).update(signingInput).digest()
      )
      expect(verifySessionToken(`${signingInput}.${sig}`, TEST_SECRET)).toBeNull()
    })

    it('returns null when payload decodes to binary garbage', () => {
      const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const garbage = encodeBase64Url(Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]))
      const signingInput = `${header}.${garbage}`
      const sig = encodeBase64Url(
        require('crypto').createHmac('sha256', TEST_SECRET).update(signingInput).digest()
      )
      expect(verifySessionToken(`${signingInput}.${sig}`, TEST_SECRET)).toBeNull()
    })

    it('returns null when payload is empty string', () => {
      const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const emptyPayload = encodeBase64Url('')
      const signingInput = `${header}.${emptyPayload}`
      const sig = encodeBase64Url(
        require('crypto').createHmac('sha256', TEST_SECRET).update(signingInput).digest()
      )
      expect(verifySessionToken(`${signingInput}.${sig}`, TEST_SECRET)).toBeNull()
    })
  })

  describe('token round-trip', () => {
    it('access token round-trip', () => {
      const { token, payload } = signSessionToken({
        subject: 'GTEST',
        walletAddress: 'GTEST',
        type: 'access',
        expiresInSeconds: 900,
        secret: TEST_SECRET,
      })

      const verified = verifySessionToken(token, TEST_SECRET)
      expect(verified).not.toBeNull()
      expect(verified?.sub).toBe(payload.sub)
      expect(verified?.wallet).toBe(payload.wallet)
      expect(verified?.jti).toBe(payload.jti)
      expect(verified?.type).toBe('access')
      expect(verified?.iat).toBe(payload.iat)
      expect(verified?.exp).toBe(payload.exp)
    })

    it('refresh token round-trip', () => {
      const { token, payload } = signSessionToken({
        subject: 'GTEST',
        walletAddress: 'GTEST',
        type: 'refresh',
        expiresInSeconds: 604800,
        secret: TEST_SECRET,
      })

      const verified = verifySessionToken(token, TEST_SECRET)
      expect(verified).not.toBeNull()
      expect(verified?.type).toBe('refresh')
    })
  })
})
