import crypto from 'node:crypto'

// Firebase Cloud Messaging (HTTP v1) sender with no extra dependencies.
// Needs FIREBASE_SERVICE_ACCOUNT_JSON: the service-account key file contents, either raw JSON or base64 of it.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

let cachedAccount
let cachedToken = { value: '', expiresAt: 0 }

// Why the key could not be used (never contains the key itself). Shown by /api/push/test.
let keyProblem = ''

function cleanEnvValue(value) {
  let text = String(value || '').replace(/^\uFEFF/, '').trim()
  // Tolerate a value pasted with surrounding quotes.
  if (text.length > 1 && /^(["'`]).*\1$/s.test(text)) text = text.slice(1, -1).trim()
  return text
}

function loadServiceAccount() {
  if (cachedAccount !== undefined) return cachedAccount
  const raw = cleanEnvValue(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  cachedAccount = null
  if (!raw) {
    keyProblem = 'FIREBASE_SERVICE_ACCOUNT_JSON is not set (or empty) in this deployment'
    return cachedAccount
  }
  try {
    // Base64 may have been pasted with line breaks or spaces: strip them before decoding.
    const text = raw.startsWith('{')
      ? raw
      : Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8').replace(/^\uFEFF/, '').trim()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (firstError) {
      // A copy/paste into the Vercel field often drops the last character(s), which is the closing "}".
      // Retry once with it restored; the private key in the middle is unaffected and is verified when signing.
      try {
        parsed = JSON.parse(`${text}\n}`)
      } catch {
        throw firstError
      }
    }
    const missing = ['client_email', 'private_key', 'project_id'].filter((field) => !parsed?.[field])
    if (missing.length) {
      keyProblem = `the key was read but is missing: ${missing.join(', ')} (is it the service-account file?)`
    } else {
      cachedAccount = { ...parsed, private_key: String(parsed.private_key).replace(/\\n/g, '\n') }
      keyProblem = ''
    }
  } catch (error) {
    keyProblem = `the value is set (${raw.length} characters) but is not valid JSON or base64 JSON: ${error.message}`
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is not valid:', error.message)
  }
  return cachedAccount
}

export function fcmConfigured() {
  return Boolean(loadServiceAccount())
}

/** Human-readable reason the key is unusable ('' when it is fine). Safe to show: never includes the key. */
export function fcmProblem() {
  loadServiceAccount()
  return keyProblem
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url')
}

async function getAccessToken(account) {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken.value && cachedToken.expiresAt - 60 > now) return cachedToken.value

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  )
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), account.private_key).toString('base64url')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token request failed (${response.status})`)
  }
  cachedToken = { value: payload.access_token, expiresAt: now + Number(payload.expires_in || 3600) }
  return cachedToken.value
}

/**
 * Sends one push to one device token.
 * Returns { ok: true } or { ok: false, invalidToken, error }. Never throws.
 * `invalidToken` is true when FCM says the token is dead and should be deleted.
 */
export async function sendPush(token, { title, body, data = {} }) {
  const account = loadServiceAccount()
  if (!account) return { ok: false, invalidToken: false, error: 'FCM is not configured' }

  try {
    const accessToken = await getAccessToken(account)
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          // FCM data values must all be strings.
          data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '')])),
          android: {
            priority: 'HIGH',
            // Must match the channel created in MainActivity.kt and the default in AndroidManifest.xml.
            notification: { channel_id: 'synthra_alerts', sound: 'default', default_vibrate_timings: true },
          },
        },
      }),
    })
    if (response.ok) return { ok: true }

    const payload = await response.json().catch(() => ({}))
    const status = payload?.error?.status || ''
    const detail = JSON.stringify(payload?.error?.details || [])
    const invalidToken =
      status === 'NOT_FOUND' ||
      status === 'UNREGISTERED' ||
      detail.includes('UNREGISTERED') ||
      (status === 'INVALID_ARGUMENT' && /registration token/i.test(payload?.error?.message || ''))
    return { ok: false, invalidToken, error: payload?.error?.message || `FCM error ${response.status}` }
  } catch (error) {
    return { ok: false, invalidToken: false, error: error.message }
  }
}
