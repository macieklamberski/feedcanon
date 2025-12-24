import type { PlatformHandler } from '../types.js'

const hosts = new Set(['blogger.com', 'www.blogger.com'])

export const bloggerHandler: PlatformHandler = {
  match: (url) => {
    return hosts.has(url.hostname)
  },

  normalize: (url) => {
    const normalized = new URL(url)

    // Force HTTPS (Blogger rewrites internal links based on protocol).
    normalized.protocol = 'https:'

    // Normalize to www (non-www redirects to www).
    normalized.hostname = 'www.blogger.com'

    // Strip redirect param (controls redirect behavior, not content).
    normalized.searchParams.delete('redirect')

    return normalized
  },
}
