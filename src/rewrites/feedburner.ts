import type { NormalizeOptions, Rewrite } from '../types.js'
import { normalizeUrl } from '../utils.js'

const hosts = ['feeds.feedburner.com', 'feeds2.feedburner.com', 'feedproxy.google.com']

export const feedburnerRewrite: Rewrite = {
  match: (url) => {
    return hosts.includes(url.hostname)
  },

  rewrite: (url) => {
    const rewritten = new URL(url)

    // Normalize domain to feeds.feedburner.com.
    rewritten.hostname = 'feeds.feedburner.com'

    // Strip all query params (FeedBurner uses them for tracking only).
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
