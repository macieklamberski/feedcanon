import type { Rewrite } from '../types.js'

// Matches blogger.com, www.blogger.com, and beta.blogger.com.
const bloggerPattern = /^(www\.|beta\.)?blogger\.com$/
// Matches *.blogspot.com and country-specific TLDs like *.blogspot.co.uk, *.blogspot.de.
const blogspotPattern = /\.blogspot\.[a-z]{2,3}(\.[a-z]{2})?$/i

export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return bloggerPattern.test(url.hostname) || blogspotPattern.test(url.hostname)
  },

  normalize: (url) => {
    const normalized = new URL(url)
    const isBlogger = bloggerPattern.test(normalized.hostname)
    const isBlogspot = blogspotPattern.test(normalized.hostname)

    // Force HTTPS (Blogger/Blogspot rewrites internal links based on protocol).
    normalized.protocol = 'https:'

    // Normalize Blogger URLs to www (non-www redirects to www).
    if (isBlogger) {
      normalized.hostname = 'www.blogger.com'
    }

    // Normalize country-specific TLDs to .blogspot.com (Google redirects these anyway).
    // Rewrite legacy feed URLs to modern format - atom.xml and rss.xml are backward-compatible.
    if (isBlogspot) {
      normalized.hostname = normalized.hostname.replace(blogspotPattern, '.blogspot.com')

      if (normalized.pathname === '/atom.xml') {
        normalized.pathname = '/feeds/posts/default'
      } else if (normalized.pathname === '/rss.xml') {
        normalized.pathname = '/feeds/posts/default'
        normalized.searchParams.set('alt', 'rss')
      }
    }

    // Strip redirect param (controls redirect behavior, not content).
    normalized.searchParams.delete('redirect')

    // Strip alt=atom and alt=json (Atom is the default, JSON is same content).
    const alt = normalized.searchParams.get('alt')
    if (alt === 'atom' || alt === 'json' || alt === '') {
      normalized.searchParams.delete('alt')
    }

    // Strip v param (GData API version, deprecated and now ignored).
    normalized.searchParams.delete('v')

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
