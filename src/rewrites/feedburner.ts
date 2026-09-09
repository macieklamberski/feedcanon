import type { Rewrite } from '../types.js'
import { normalizeUrl } from '../utils.js'

const hosts = ['feeds.feedburner.com', 'feeds2.feedburner.com', 'feedproxy.google.com']

// FeedBurner serves one feed from three hosts and uses the query only for tracking.
export const feedburnerRewrite: Rewrite = {
  match: (url) => {
    return hosts.includes(url.hostname)
  },

  rewrite: (url) => {
    const rewritten = new URL(url)

    rewritten.hostname = 'feeds.feedburner.com'

    rewritten.search = ''

    const normalized = normalizeUrl(rewritten.href, {
      stripTrailingSlash: true,
      collapseSlashes: true,
      stripHash: true,
      normalizeEncoding: true,
      normalizeUnicode: true,
    })

    return new URL(normalized)
  },
}
