export function appUrl(path) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  return baseUrl ? `${baseUrl}${path}` : path
}