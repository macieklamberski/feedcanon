import type { Rewrite } from '../types.js'
import { normalizeUrl } from '../utils.js'

// Matches blogger.com, www.blogger.com, and beta.blogger.com.
const bloggerPattern = /^(www\.|beta\.)?blogger\.com$/
// Matches *.blogspot.com and country-specific TLDs like *.blogspot.co.uk, *.blogspot.de.
const blogspotPattern = /\.blogspot\.[a-z]{2,3}(\.[a-z]{2})?$/i

export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return bloggerPattern.test(url.hostname) || blogspotPattern.test(url.hostname)
  },

  rewrite: (url) => {
    const rewritten = new URL(url)
    const isBlogger = bloggerPattern.test(rewritten.hostname)
    const isBlogspot = blogspotPattern.test(rewritten.hostname)

    // Force HTTPS (Blogger/Blogspot rewrites internal links based on protocol).
    rewritten.protocol = 'https:'

    // Normalize Blogger URLs to www (non-www redirects to www).
    if (isBlogger) {
      rewritten.hostname = 'www.blogger.com'
    }

    // Normalize country-specific TLDs to .blogspot.com (Google redirects these anyway).
    // Rewrite legacy feed URLs to modern format - atom.xml and rss.xml are backward-compatible.
    if (isBlogspot) {
      rewritten.hostname = rewritten.hostname.replace(blogspotPattern, '.blogspot.com')

      if (rewritten.pathname === '/atom.xml') {
        rewritten.pathname = '/feeds/posts/default'
      } else if (rewritten.pathname === '/rss.xml') {
        rewritten.pathname = '/feeds/posts/default'
        rewritten.searchParams.set('alt', 'rss')
      }
    }

    // Strip redirect param (controls redirect behavior, not content).
    rewritten.searchParams.delete('redirect')

    // Strip alt=atom and alt=json (Atom is the default, JSON is same content).
    const alt = rewritten.searchParams.get('alt')
    if (alt === 'atom' || alt === 'json' || alt === '') {
      rewritten.searchParams.delete('alt')
    }

    // Strip v param (GData API version, deprecated and now ignored).
    rewritten.searchParams.delete('v')

    // Strip pagination and date filter params. Feed readers subscribe to full
    // feeds, not filtered views. Stripping these ensures subscriptions to the
    // same blog with different limits or date ranges canonicalize to one URL.
    rewritten.searchParams.delete('max-results')
    rewritten.searchParams.delete('start-index')
    rewritten.searchParams.delete('published-min')
    rewritten.searchParams.delete('published-max')
    rewritten.searchParams.delete('updated-min')
    rewritten.searchParams.delete('updated-max')

    // Strip orderby param.
    rewritten.searchParams.delete('orderby')

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
