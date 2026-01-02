import type { Rewrite } from '../types.js'

const hosts = ['feeds.feedburner.com', 'feeds2.feedburner.com', 'feedproxy.google.com']

export const feedburnerRewrite: Rewrite = {
  match: (url) => {
    return hosts.includes(url.hostname)
  },

  normalize: (url) => {
    const normalized = new URL(url)

    // Normalize domain to feeds.feedburner.com.
    normalized.hostname = 'feeds.feedburner.com'

    // Strip all query params (FeedBurner uses them for tracking only).
    normalized.search = ''

    return normalized
  },
}
