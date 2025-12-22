import type { PlatformHandler } from '../types.js'

const hosts = new Set(['feeds.feedburner.com', 'feeds2.feedburner.com', 'feedproxy.google.com'])

export const feedburnerHandler: PlatformHandler = {
  match: (url) => {
    return hosts.has(url.hostname)
  },

  normalize: (url) => {
    const normalized = new URL(url.href)

    // Normalize domain to feeds.feedburner.com.
    normalized.hostname = 'feeds.feedburner.com'

    // Strip all query params (FeedBurner uses them for tracking only).
    normalized.search = ''

    return normalized
  },
}
