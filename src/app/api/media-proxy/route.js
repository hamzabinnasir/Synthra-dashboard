import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Hosts the proxy may fetch from. Anything else is rejected (prevents SSRF).
const ALLOWED_HOSTS = new Set([
  'graph.facebook.com',
  'graph.instagram.com',
  'lookaside.fbsbx.com',
  'res.cloudinary.com',
])
const ALLOWED_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com', '.whatsapp.net']

// Only these hosts ever receive the WhatsApp bearer token.
const TOKEN_HOSTS = new Set(['graph.facebook.com', 'lookaside.fbsbx.com'])

function parseAllowedUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const allowed = ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  return allowed ? url : null
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawUrl = searchParams.get('url')
    const mediaId = searchParams.get('mediaId')
    const token = process.env.WHATSAPP_ACCESS_TOKEN

    let target = null

    if (mediaId && !rawUrl) {
      if (!/^\d{5,30}$/.test(mediaId)) {
        return new NextResponse('Invalid mediaId', { status: 400 })
      }
      const graphBase = (process.env.WHATSAPP_GRAPH_API_URL || 'https://graph.facebook.com/v26.0').replace(/\/$/, '')
      const metaRes = await fetch(`${graphBase}/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!metaRes.ok) {
        return new NextResponse('Could not retrieve media details from Meta', { status: metaRes.status })
      }
      const data = await metaRes.json()
      target = parseAllowedUrl(data.url)
    } else if (rawUrl) {
      target = parseAllowedUrl(rawUrl)
    } else {
      return new NextResponse('Missing url or mediaId parameter', { status: 400 })
    }

    if (!target) {
      return new NextResponse('URL host is not allowed', { status: 400 })
    }

    const headers = {}
    if (token && TOKEN_HOSTS.has(target.hostname.toLowerCase())) {
      headers.Authorization = `Bearer ${token}`
    }

    const mediaRes = await fetch(target.toString(), { headers })
    if (!mediaRes.ok) {
      return new NextResponse('Failed to fetch media from provider', { status: mediaRes.status })
    }

    const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await mediaRes.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // private: this route is behind login, so shared caches must not store it.
        'Cache-Control': 'private, max-age=86400',
        'Content-Length': String(arrayBuffer.byteLength),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[MEDIA-PROXY] error:', err)
    return new NextResponse('Internal error proxying media', { status: 500 })
  }
}
