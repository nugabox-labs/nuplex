import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// 공통 비밀번호 1개를 scrypt 로 검증한다. 평문은 .env 를 포함해 어디에도 두지 않는다.
// node:crypto 를 쓰므로 이 파일을 import 하는 라우트는 runtime = 'nodejs' 여야 한다.
//
// 형식: scrypt:N:r:p:<salt hex>:<key hex>
// 파라미터를 해시 안에 넣어두면 나중에 비용을 올려도 옛 해시가 그대로 검증된다.
// 구분자로 $ 를 쓰지 않는다 — docker compose 가 env_file 값의 $ 를 변수로 해석해 버린다.

// promisify 는 scrypt 의 options 인자를 못 살린다. 직접 감싼다.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

const KEY_LENGTH = 64
const DEFAULTS = { N: 16384, r: 8, p: 1 }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = (await scryptAsync(password, salt, KEY_LENGTH, DEFAULTS))
  return [
    'scrypt',
    DEFAULTS.N,
    DEFAULTS.r,
    DEFAULTS.p,
    salt.toString('hex'),
    key.toString('hex'),
  ].join(':')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, n, r, p, saltHex, keyHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(keyHex, 'hex')

  try {
    const actual = (await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    }))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
