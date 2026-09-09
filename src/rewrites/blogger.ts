import type { Rewrite } from '../types.js'
import { normalizeUrl } from '../utils.js'

const bloggerRegex = /^(www\.|beta\.)?blogger\.com$/
const blogspotRegex = /\.blogspot\.[a-z]{2,3}(\.[a-z]{2})?$/i

// Blogspot answers every country TLD and the legacy atom.xml and rss.xml paths with one feed.
export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return bloggerRegex.test(url.hostname) || blogspotRegex.test(url.hostname)
  },

  rewrite: (url) => {
    const rewritten = new URL(url)
    const isBlogger = bloggerRegex.test(rewritten.hostname)
    const isBlogspot = blogspotRegex.test(rewritten.hostname)

    rewritten.protocol = 'https:'

    if (isBlogger) {
      rewritten.hostname = 'www.blogger.com'
    }

    if (isBlogspot) {
      rewritten.hostname = rewritten.hostname.replace(blogspotRegex, '.blogspot.com')

      if (rewritten.pathname === '/atom.xml') {
        rewritten.pathname = '/feeds/posts/default'
      } else if (rewritten.pathname === '/rss.xml') {
        rewritten.pathname = '/feeds/posts/default'
        rewritten.searchParams.set('alt', 'rss')
      }
    }

    rewritten.searchParams.delete('redirect')

    const alt = rewritten.searchParams.get('alt')
    if (alt === 'atom' || alt === 'json' || alt === '') {
      rewritten.searchParams.delete('alt')
    }

    rewritten.searchParams.delete('v')

    rewritten.searchParams.delete('max-results')
    rewritten.searchParams.delete('start-index')
    rewritten.searchParams.delete('published-min')
    rewritten.searchParams.delete('published-max')
    rewritten.searchParams.delete('updated-min')
    rewritten.searchParams.delete('updated-max')

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
