import type { Rewrite } from '../types.js'

export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return url.hostname === 'blogger.com' || url.hostname === 'www.blogger.com'
  },

  normalize: (url) => {
    const normalized = new URL(url)

    // Force HTTPS (Blogger rewrites internal links based on protocol).
    normalized.protocol = 'https:'

    // Normalize to www (non-www redirects to www).
    normalized.hostname = 'www.blogger.com'

    // Strip redirect param (controls redirect behavior, not content).
    normalized.searchParams.delete('redirect')

    // Strip alt=atom (Atom is the default format, so this param is redundant).
    if (normalized.searchParams.get('alt') === 'atom') {
      normalized.searchParams.delete('alt')
    }

    // Strip pagination and date filter params. Feed readers subscribe to full
    // feeds, not filtered views. Stripping these ensures subscriptions to the
    // same blog with different limits or date ranges canonicalize to one URL.
    normalized.searchParams.delete('max-results')
    normalized.searchParams.delete('start-index')
    normalized.searchParams.delete('published-min')
    normalized.searchParams.delete('published-max')
    normalized.searchParams.delete('updated-min')
    normalized.searchParams.delete('updated-max')

    // Strip orderby param.
    normalized.searchParams.delete('orderby')

    return normalized
  },
}
