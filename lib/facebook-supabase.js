import { createClient } from '@supabase/supabase-js'

let facebookClient

export function getFacebookSupabase() {
  const url = process.env.FACEBOOK_SUPABASE_URL
  const key = process.env.FACEBOOK_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!facebookClient) {
    facebookClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return facebookClient
}