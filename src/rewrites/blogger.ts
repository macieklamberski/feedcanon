import { normalizeUrl } from 'trousse'
import type { Rewrite } from '../types.js'

// Matches blogger.com, www.blogger.com, and beta.blogger.com.
const bloggerRegex = /^(www\.|beta\.)?blogger\.com$/
// Matches *.blogspot.com and the country-specific TLDs like *.blogspot.co.uk, *.blogspot.de.
const blogspotRegex = /\.blogspot\.(com|(co|com)\.[a-z]{2}|[a-z]{2})$/i

const redundantAltValues: Array<string | null> = ['atom', 'json', '']

const strippedParams = [
  'redirect', // Controls redirect behavior, not content.
  'v', // GData API version, deprecated and now ignored.
  // Pagination and date filters. Feed readers subscribe to full feeds, not filtered views, so
  // subscriptions with different limits or date ranges canonicalize to one URL.
  'max-results',
  'start-index',
  'published-min',
  'published-max',
  'updated-min',
  'updated-max',
  'orderby',
]

export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return bloggerRegex.test(url.hostname) || blogspotRegex.test(url.hostname)
  },

  rewrite: (url) => {
    const rewritten = new URL(url)
    const isBlogger = bloggerRegex.test(rewritten.hostname)
    const isBlogspot = blogspotRegex.test(rewritten.hostname)

    // Force HTTPS (Blogger/Blogspot rewrites internal links based on protocol).
    rewritten.protocol = 'https:'

    // Normalize Blogger URLs to www (non-www redirects to www).
    if (isBlogger) {
      rewritten.hostname = 'www.blogger.com'
    }

    // Normalize country-specific TLDs to .blogspot.com (Google redirects these anyway).
    // Rewrite legacy feed URLs to modern format - atom.xml and rss.xml are backward-compatible.
    if (isBlogspot) {
      rewritten.hostname = rewritten.hostname.replace(blogspotRegex, '.blogspot.com')

      if (rewritten.pathname === '/atom.xml') {
        rewritten.pathname = '/feeds/posts/default'
      } else if (rewritten.pathname === '/rss.xml') {
        rewritten.pathname = '/feeds/posts/default'
        rewritten.searchParams.set('alt', 'rss')
      }
    }

    for (const param of strippedParams) {
      rewritten.searchParams.delete(param)
    }

    // Strip alt=atom and alt=json (Atom is the default, JSON is same content).
    const alt = rewritten.searchParams.get('alt')
    if (redundantAltValues.includes(alt)) {
      rewritten.searchParams.delete('alt')
    }

    const normalized = normalizeUrl(rewritten.href, {
      stripTrailingSlash: true,
      collapseSlashes: true,
      stripHash: true,
      normalizeEncoding: true,
      normalizeUnicode: true,
      stripEmptyQuery: true,
      sortQueryParams: true,
    })

    return new URL(normalized)
  },
}
