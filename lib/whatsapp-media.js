import crypto from 'node:crypto'
import { cloudinaryConfigured } from './cloudinary.js'

const MB = 1024 * 1024

// What WhatsApp Cloud API accepts when sending by link, mapped to how we
// classify it and the size we allow (kept under Cloudinary free-plan limits).
const MIME_RULES = [
  { kind: 'image', mimes: ['image/jpeg', 'image/jpg', 'image/png'], max: 5 * MB },
  // Video/audio are kept at 10 MB: Next.js middleware buffers request bodies up to 10 MB by default.
  { kind: 'video', mimes: ['video/mp4', 'video/3gpp'], max: 10 * MB },
  {
    kind: 'audio',
    mimes: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
    max: 10 * MB,
  },
  {
    kind: 'document',
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
    max: 10 * MB,
  },
]

export function classifyWhatsAppMedia(mimeType) {
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase()
  const rule = MIME_RULES.find((entry) => entry.mimes.includes(mime))
  if (!rule) return null
  return { kind: rule.kind, mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime, maxBytes: rule.max }
}

function cloudinaryResourceType(kind) {
  if (kind === 'image') return 'image'
  if (kind === 'video' || kind === 'audio') return 'video' // Cloudinary stores audio under "video"
  return 'raw'
}

function sign(params, secret) {
  const body = Object.keys(params)
    .filter((key) => params[key] != null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${body}${secret}`).digest('hex')
}

function safeExtension(filename) {
  const match = String(filename || '').match(/\.([a-zA-Z0-9]{1,8})$/)
  return match ? `.${match[1].toLowerCase()}` : ''
}

/**
 * Uploads any WhatsApp-sendable file to Cloudinary and returns a public https URL
 * that the WhatsApp Cloud API can fetch, plus the id needed to delete it later.
 */
export async function uploadWhatsAppMedia(buffer, { kind, mimeType, filename }) {
  if (!cloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.')
  }
  if (!buffer?.length) throw new Error('The selected file is empty.')

  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  const key = process.env.CLOUDINARY_API_KEY
  const secret = process.env.CLOUDINARY_API_SECRET
  const resourceType = cloudinaryResourceType(kind)
  const folder = 'synthra/outbox/whatsapp'
  const timestamp = Math.floor(Date.now() / 1000)

  // Raw files (PDF, DOCX...) need the extension inside the public_id, otherwise the
  // delivered URL has no extension and recipients get an unnamed/unopenable file.
  const publicId = resourceType === 'raw'
    ? `${crypto.randomUUID()}${safeExtension(filename)}`
    : undefined

  const signParams = { folder, timestamp }
  if (publicId) signParams.public_id = publicId

  const form = new FormData()
  form.set('api_key', key)
  form.set('timestamp', String(timestamp))
  form.set('signature', sign(signParams, secret))
  form.set('folder', folder)
  if (publicId) form.set('public_id', publicId)
  form.set(
    'file',
    new Blob([Uint8Array.from(buffer)], { type: mimeType || 'application/octet-stream' }),
    filename || 'upload'
  )

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Cloudinary upload failed (${response.status})`)
  }
  return {
    url: payload.secure_url || payload.url,
    publicId: payload.public_id,
    resourceType,
  }
}
