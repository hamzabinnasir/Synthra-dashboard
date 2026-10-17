import { enrichCustomerDisplayNames } from './enrich-customers.js'

const FULL_COLUMNS = 'psid,name,custom_name,username,profile_pic_url,platform'
const BASIC_COLUMNS = 'psid,name'

/**
 * Loads the customer rows (the backend upserts one per commenter) that match the
 * given comment author IDs. Older databases may not have every profile column yet,
 * so fall back to a minimal select instead of failing the whole page.
 */
export async function loadCommentAuthors(supabase, fromIds) {
  const ids = [...new Set((fromIds || []).filter(Boolean))]
  if (!supabase || !ids.length) return new Map()

  let { data, error } = await supabase.from('customers').select(FULL_COLUMNS).in('psid', ids)
  if (error) {
    ;({ data, error } = await supabase.from('customers').select(BASIC_COLUMNS).in('psid', ids))
  }
  if (error || !data) return new Map()
  return new Map(data.map((row) => [row.psid, row]))
}

export function withAuthor(comment, author) {
  if (!author) return comment
  return {
    ...comment,
    author_pic_url: author.profile_pic_url || null,
    author_custom_name: author.custom_name || null,
    author_stored_name: author.name || null,
    author_stored_username: author.username || null,
  }
}

/**
 * Adds the commenter's profile picture, custom dashboard name and username to each
 * comment so the list can render an avatar without extra requests.
 */
export async function attachCommentAuthors(supabase, comments, platform) {
  if (!comments?.length) return comments || []
  const authors = await loadCommentAuthors(supabase, comments.map((comment) => comment.from_id))
  if (!authors.size) return comments

  const enriched = await enrichCustomerDisplayNames(supabase, [...authors.values()], platform)
  const byPsid = new Map(enriched.map((row) => [row.psid, row]))
  return comments.map((comment) => withAuthor(comment, byPsid.get(comment.from_id)))
}
