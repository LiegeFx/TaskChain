import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign, createPublicKey } from 'crypto'
import {
  isValidStellarAddress,
  normalizeWalletAddress,
  buildAuthMessage,
  verifyStellarSignature,
  getStellarPublicKey,
} from '@/lib/auth/stellar'

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

    it('accepts the reference valid address', () => {
      expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true)
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
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: 'short',
      })
      expect(result).toBe(false)
    })

    it('returns false for garbage signature that decodes to wrong length', () => {
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: '!@#$%^&*()',
      })
      expect(result).toBe(false)
    })

    it('returns false for hex-prefixed signature with wrong key', () => {
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: '0x' + 'aa'.repeat(64),
      })
      expect(result).toBe(false)
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

    it('returns false for base64url signature that is not a real signature', () => {
      const b64Sig = Buffer.alloc(64).toString('base64url')
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: b64Sig,
      })
      expect(result).toBe(false)
    })

    it('returns false for raw hex signature that is not a real signature', () => {
      const hexSig = 'aa'.repeat(64)
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: hexSig,
      })
      expect(result).toBe(false)
    })

    it('returns false for plain base64 signature that is not a real signature', () => {
      const plainB64 = Buffer.alloc(64).toString('base64')
      const result = verifyStellarSignature({
        walletAddress: VALID_ADDRESS,
        message: 'test',
        signature: plainB64,
      })
      expect(result).toBe(false)
    })

    it('accepts a real Ed25519 signature with a matching keypair', () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519')
      const rawPubKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)

      const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
      function crc16Xmodem(data: Uint8Array): number {
        let crc = 0x0000
        for (const value of data) {
          crc ^= value << 8
          for (let i = 0; i < 8; i++) {
            if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021
            else crc <<= 1
            crc &= 0xffff
          }
        }
        return crc
      }
      function toBase32(bytes: Uint8Array): string {
        let bits = 0, value = 0, output = ''
        for (const byte of bytes) {
          value = (value << 8) | byte; bits += 8
          while (bits >= 5) { bits -= 5; output += BASE32_ALPHABET[(value >>> bits) & 0x1f] }
        }
        if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
        return output
      }

      const versionByte = 0x30
      const payload = new Uint8Array(33)
      payload[0] = versionByte
      payload.set(rawPubKey, 1)
      const crc = crc16Xmodem(payload)
      const fullAddress = new Uint8Array(35)
      fullAddress.set(payload)
      fullAddress[33] = crc & 0xff
      fullAddress[34] = (crc >> 8) & 0xff
      const stellarAddress = toBase32(fullAddress)

      const message = 'TaskChain Authentication\nWallet: ' + stellarAddress + '\nNonce: test-nonce-123'
      const msgBuffer = Buffer.from(message, 'utf8')
      const signature = sign(null, msgBuffer, privateKey)
      const sigHex = signature.toString('hex')

      const result = verifyStellarSignature({
        walletAddress: stellarAddress,
        message,
        signature: sigHex,
      })
      expect(result).toBe(true)
    })

    it('returns false when signature is from a different key', () => {
      const kp1 = generateKeyPairSync('ed25519')
      const kp2 = generateKeyPairSync('ed25519')
      const rawPubKey = kp1.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)

      const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
      function crc16Xmodem(data: Uint8Array): number {
        let crc = 0x0000
        for (const value of data) {
          crc ^= value << 8; for (let i = 0; i < 8; i++) {
            if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021; else crc <<= 1; crc &= 0xffff
          }
        }
        return crc
      }
      function toBase32(bytes: Uint8Array): string {
        let bits = 0, value = 0, output = ''
        for (const byte of bytes) {
          value = (value << 8) | byte; bits += 8
          while (bits >= 5) { bits -= 5; output += BASE32_ALPHABET[(value >>> bits) & 0x1f] }
        }
        if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
        return output
      }

      const payload = new Uint8Array(33)
      payload[0] = 0x30
      payload.set(rawPubKey, 1)
      const crc = crc16Xmodem(payload)
      const fullAddress = new Uint8Array(35)
      fullAddress.set(payload)
      fullAddress[33] = crc & 0xff
      fullAddress[34] = (crc >> 8) & 0xff
      const stellarAddress = toBase32(fullAddress)

      const message = 'test message'
      const signature = sign(null, Buffer.from(message, 'utf8'), kp2.privateKey)

      const result = verifyStellarSignature({
        walletAddress: stellarAddress,
        message,
        signature: signature.toString('hex'),
      })
      expect(result).toBe(false)
    })
  })

  describe('address validation edge cases (version byte and checksum)', () => {
    const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

    function crc16Xmodem(data: Uint8Array): number {
      let crc = 0x0000
      for (const value of data) {
        crc ^= value << 8
        for (let i = 0; i < 8; i++) {
          if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021
          else crc <<= 1
          crc &= 0xffff
        }
      }
      return crc
    }

    function decodeBase32(input: string): Uint8Array {
      const normalized = input.trim().toUpperCase().replace(/=+$/g, '')
      let bits = 0; let value = 0; const output: number[] = []
      for (const char of normalized) {
        const index = BASE32_ALPHABET.indexOf(char)
        if (index === -1) throw new Error('Invalid base32 character')
        value = (value << 5) | index
        bits += 5
        if (bits >= 8) { bits -= 8; output.push((value >>> bits) & 0xff) }
      }
      return Uint8Array.from(output)
    }

    function encodeBase32(bytes: Uint8Array): string {
      let bits = 0; let value = 0; let output = ''
      for (const byte of bytes) {
        value = (value << 8) | byte
        bits += 8
        while (bits >= 5) { bits -= 5; output += BASE32_ALPHABET[(value >>> bits) & 0x1f] }
      }
      if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
      return output
    }

    it('rejects address with wrong version byte', () => {
      const decoded = decodeBase32(VALID_ADDRESS)
      expect(decoded.length).toBe(35)
      const modified = new Uint8Array(decoded)
      modified[0] = 0x62
      const payload = modified.subarray(0, 33)
      const crc = crc16Xmodem(payload)
      modified[33] = crc & 0xff
      modified[34] = (crc >> 8) & 0xff
      const badAddr = encodeBase32(modified)
      expect(badAddr.length).toBe(56)
      expect(() => getStellarPublicKey(badAddr)).toThrow('Invalid Stellar address version byte')
    })

    it('rejects address with wrong checksum', () => {
      const decoded = decodeBase32(VALID_ADDRESS)
      const modified = new Uint8Array(decoded)
      modified[0] = 0x30
      const payload = modified.subarray(0, 33)
      const crc = crc16Xmodem(payload)
      modified[33] = (crc & 0xff) ^ 0xff
      modified[34] = ((crc >> 8) & 0xff) ^ 0xff
      const badAddr = encodeBase32(modified)
      expect(badAddr.length).toBe(56)
      expect(() => getStellarPublicKey(badAddr)).toThrow('Invalid Stellar address checksum')
    })
  })
})
