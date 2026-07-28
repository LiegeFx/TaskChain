import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs'
import { readFile, unlink, writeFile } from 'fs/promises'
import path from 'path'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function getEncryptionKey(keyId: string): Buffer {
  const envKey = keyId === 'primary' ? process.env.FILE_ENCRYPTION_KEY : undefined
  const raw = envKey ?? process.env.FILE_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'FILE_ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return createHash('sha256').update(raw).digest()
}

export function encryptBuffer(plaintext: Buffer, keyId = 'primary'): { iv: string; ciphertext: Buffer } {
  const key = getEncryptionKey(keyId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { iv: iv.toString('hex'), ciphertext }
}

export function decryptBuffer(ciphertext: Buffer, ivHex: string, keyId = 'primary'): Buffer {
  const key = getEncryptionKey(keyId)
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function getUploadDir(): string {
  const base = process.env.FILE_UPLOAD_DIR || path.join(process.cwd(), 'uploads')
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

export async function storeEncryptedFile(
  buffer: Buffer,
  storedFilename: string,
  keyId = 'primary',
): Promise<{ iv: string; filePath: string }> {
  const { iv, ciphertext } = encryptBuffer(buffer, keyId)
  const uploadDir = getUploadDir()
  const filePath = path.join(uploadDir, storedFilename)
  await writeFile(filePath, ciphertext)
  return { iv, filePath }
}

export async function readEncryptedFile(
  filePath: string,
  ivHex: string,
  keyId = 'primary',
): Promise<Buffer> {
  const ciphertext = await readFile(filePath)
  return decryptBuffer(ciphertext, ivHex, keyId)
}

export async function removeEncryptedFile(filePath: string): Promise<void> {
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

export function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
