import { normalizeUrl } from 'trousse'
import type { Rewrite } from '../types.js'

// Matches blogger.com, www.blogger.com, and beta.blogger.com.
const bloggerRegex = /^(www\.|beta\.)?blogger\.com$/
// Matches *.blogspot.com and the country-specific TLDs like *.blogspot.co.uk, *.blogspot.de.
const blogspotRegex = /\.blogspot\.(com|(co|com)\.[a-z]{2}|[a-z]{2})$/i

// Matches the www label in front of a blog's name, as in www.example.blogspot.com.
const blogspotWwwRegex = /^www\.(?=[^.]+\.blogspot\.com$)/

const redundantAltValues = ['atom', 'json', '']

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

      // The Blogspot certificate does not cover the www host of a blog, so its https form cannot
      // be fetched. It serves the same feed as the host without www.
      rewritten.hostname = rewritten.hostname.replace(blogspotWwwRegex, '')

      if (rewritten.pathname === '/atom.xml') {
        rewritten.pathname = '/feeds/posts/default'
      } else if (rewritten.pathname === '/rss.xml') {
        rewritten.pathname = '/feeds/posts/default'
        rewritten.searchParams.set('alt', 'rss')
      }
    }

    // Strip v (GData API version, now ignored). The other API params stay: without
    // `redirect=false` a blog with FeedBurner set up redirects its feed there, which can carry
    // different content, and pagination, date filters and `orderby` select other posts.
    rewritten.searchParams.delete('v')

    // Strip alt=atom and alt=json (Atom is the default, JSON is same content).
    const altValues = rewritten.searchParams.getAll('alt')
    rewritten.searchParams.delete('alt')

    for (const alt of altValues) {
      if (!redundantAltValues.includes(alt)) {
        rewritten.searchParams.append('alt', alt)
      }
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
