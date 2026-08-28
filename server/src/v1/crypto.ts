import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

const PASSWORD_VERSION = 'scrypt-v1'
const KEY_BYTES = 64
const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const

function secret(): string {
  const value = process.env.APP_HMAC_SECRET
  if (!value || value.length < 32) throw new Error('APP_HMAC_SECRET must be at least 32 characters')
  return value
}

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export function digestSecret(value: string, context: string): string {
  return createHmac('sha256', secret()).update(`${context}\0${value}`).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomFourDigitCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0')
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 256) throw new Error('password_length_invalid')
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEY_BYTES)
  return [PASSWORD_VERSION, salt.toString('base64url'), derived.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [version, saltB64, hashB64] = stored.split('$')
  if (version !== PASSWORD_VERSION || !saltB64 || !hashB64) return false
  try {
    const salt = Buffer.from(saltB64, 'base64url')
    const expected = Buffer.from(hashB64, 'base64url')
    const actual = await scryptAsync(password, salt, expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function safeEqualText(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}
