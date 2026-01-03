import type { Rewrite } from '../types.js'

// Matches *.blogspot.com and country-specific TLDs like *.blogspot.co.uk, *.blogspot.de.
const blogspotPattern = /\.blogspot\.[a-z]{2,3}(\.[a-z]{2})?$/i

export const blogspotRewrite: Rewrite = {
  match: (url) => {
    return blogspotPattern.test(url.hostname)
  },

  normalize: (url) => {
    const normalized = new URL(url)

    // Force HTTPS (Blogger rewrites internal links based on protocol).
    normalized.protocol = 'https:'

    // Normalize country-specific TLDs to .blogspot.com (Google redirects these anyway).
    normalized.hostname = normalized.hostname.replace(blogspotPattern, '.blogspot.com')

    // Rewrite legacy feed URLs to modern format.
    // atom.xml and rss.xml are backward-compatible but undocumented.
    if (normalized.pathname === '/atom.xml') {
      normalized.pathname = '/feeds/posts/default'
    } else if (normalized.pathname === '/rss.xml') {
      normalized.pathname = '/feeds/posts/default'
      normalized.searchParams.set('alt', 'rss')
    }

    // Strip redirect param (controls FeedBurner redirect behavior, not content).
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
