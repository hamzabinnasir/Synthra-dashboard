import crypto from 'node:crypto'
import { supabase } from './supabase.js'

export const SESSION_COOKIE_NAME = 'admin_session'

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    // Never fall back to a value that is committed in source control.
    throw new Error('ADMIN_JWT_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set')
  }
  return secret
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

/**
 * Hashes a password using PBKDF2 with SHA-512 (100,000 iterations).
 * Format: {salt}:{hash}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verifies a password against a stored {salt}:{hash}.
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false
  }
  const [salt, originalHash] = storedHash.split(':')
  const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(originalHash, 'hex'))
  } catch {
    return false
  }
}

/**
 * Signs a standard JWT with HMAC-SHA256.
 */
export function signJwt(payload, expiresInSeconds = 7 * 86400) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

/**
 * Verifies an HMAC-SHA256 JWT. Returns payload if valid, null otherwise.
 */
export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, signature] = parts
  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
    if (!valid) return null

    const payload = JSON.parse(base64UrlDecode(encodedPayload))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/**
 * Generates a cryptographically secure random token (hex).
 */
export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex')
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

/**
 * Reads a Bearer token from the Authorization header (used by the Flutter mobile app).
 * Returns null when the request has no such header.
 */
export function getBearerToken(request) {
  const header = request?.headers?.get?.('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/**
 * Retrieves the current admin user from the session cookie (web) or Bearer token (mobile) / database.
 */
export async function getCurrentAdmin(requestOrCookies) {
  let token = null
  if (requestOrCookies && typeof requestOrCookies.get === 'function') {
    // cookies() or headers
    const cookie = requestOrCookies.get(SESSION_COOKIE_NAME)
    token = cookie?.value || cookie
  } else if (requestOrCookies?.cookies?.get) {
    // NextRequest
    token = requestOrCookies.cookies.get(SESSION_COOKIE_NAME)?.value
  }

  // Mobile app: same JWT, sent as "Authorization: Bearer <token>" instead of a cookie.
  if (!token) token = getBearerToken(requestOrCookies)

  if (!token) return null
  const payload = verifyJwt(token)
  if (!payload || !payload.userId) return null

  try {
    const columns = 'id,email,name,avatar_url,cover_url,avatar_public_id,cover_public_id,created_at,updated_at'
    let { data: user, error } = await supabase
      .from('admin_users')
      .select(columns)
      .eq('id', payload.userId)
      .maybeSingle()

    if ((error && String(error.message || '').includes('public_id')) || error?.code === 'PGRST204') {
      const fallback = await supabase
        .from('admin_users')
        .select('id,email,name,avatar_url,cover_url,created_at,updated_at')
        .eq('id', payload.userId)
        .maybeSingle()
      user = fallback.data
      error = fallback.error
    }

    if ((!user || error) && payload.email) {
      const byEmail = await supabase
        .from('admin_users')
        .select(columns)
        .eq('email', String(payload.email).toLowerCase())
        .maybeSingle()
      if (byEmail.data) return byEmail.data
    }

    if (error || !user) return null
    return user
  } catch {
    return null
  }
}
