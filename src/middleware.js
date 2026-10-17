import { NextResponse } from 'next/server'

const SESSION_COOKIE = 'admin_session'
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password']
const PUBLIC_PREFIXES = ['/api/auth', '/_next']
const PUBLIC_FILES = ['/favicon.ico', '/synthra-mark.svg']

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlToBytes(value) {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Verifies the HS256 signature and expiry of the session JWT using Web Crypto
 * (the Edge runtime has no node:crypto). Checking only the token's shape lets
 * anyone forge a cookie and reach every API route.
 */
async function isValidSession(token) {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || !token) return false

  const parts = token.split('.')
  if (parts.length !== 3) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const signatureOk = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`)
    )
    if (!signatureOk) return false

    const payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[1])))
    if (!payload?.userId) return false
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false
    return true
  } catch {
    return false
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const authed = await isValidSession(token)

  if (AUTH_PAGES.includes(pathname)) {
    if (authed) return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  if (
    PUBLIC_FILES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next()
  }

  if (authed) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('redirect', pathname)
  const response = NextResponse.redirect(loginUrl)
  if (token) response.cookies.delete(SESSION_COOKIE)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except Next static assets and image files.
     * Do NOT add a blanket "path contains a dot" bypass: dynamic API segments
     * such as /api/conversation/[id]/messages can contain dots.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
