// Known feed-related protocol schemes.
const feedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

// Convert known feed-related protocols to HTTPS. Examples:
// - feed://example.com/rss.xml → https://example.com/rss.xml
// - feed:https://example.com/rss.xml → https://example.com/rss.xml
// - rss://example.com/feed.xml → https://example.com/feed.xml
// - pcast://example.com/podcast.xml → https://example.com/podcast.xml
// - itpc://example.com/podcast.xml → https://example.com/podcast.xml
export const resolveNonStandardFeedUrl = (url: string): string => {
  const urlLower = url.toLowerCase()

  for (const scheme of feedProtocols) {
    if (!urlLower.startsWith(scheme)) {
      continue
    }

    // Case 1: Wrapping protocol (e.g., feed:https://example.com).
    if (urlLower.startsWith(`${scheme}http://`) || urlLower.startsWith(`${scheme}https://`)) {
      return url.slice(scheme.length)
    }

    // Case 2: Replacing protocol (e.g., feed://example.com).
    if (urlLower.startsWith(`${scheme}//`)) {
      return `https:${url.slice(scheme.length)}`
    }
  }

  return url
}

// Adds protocol to URLs missing a scheme. Handles both protocol-relative
// URLs (//example.com) and bare domains (example.com). Examples:
// - //example.com/feed → https://example.com/feed
// - example.com/feed → https://example.com/feed
// - /path/to/feed → /path/to/feed (unchanged, relative path)
export const addMissingProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  // Skip if URL already has a protocol.
  try {
    const parsed = new URL(url)
    if (!parsed.protocol.includes('.') && parsed.protocol !== 'localhost:') {
      return url
    }
  } catch {
    // Not a valid URL yet, continue with protocol addition.
  }

  // Case 1: Protocol-relative URL (//example.com).
  if (url.startsWith('//') && !url.startsWith('///')) {
    try {
      const parsed = new URL(`${protocol}:${url}`)
      const hostname = parsed.hostname

      // Valid web hostnames must have a dot or be localhost.
      if (hostname.indexOf('.') !== -1 || hostname === 'localhost') {
        return parsed.href
      }

      return url
    } catch {
      return url
    }
  }

  // Case 2: Bare domain (example.com/feed).
  if (url.startsWith('/') || url.startsWith('.')) {
    return url
  }

  // Dot must be in the hostname (before first slash), not in the path.
  const slashIndex = url.indexOf('/')
  const dotIndex = url.indexOf('.')
  if (dotIndex === -1 || (slashIndex !== -1 && dotIndex > slashIndex)) {
    if (!url.startsWith('localhost')) {
      return url
    }
  }

  // Check if it looks like a domain.
  const firstChar = url.charAt(0)
  if (firstChar === ' ' || firstChar === '\t' || firstChar === '\n') {
    return url
  }

  return `${protocol}://${url}`
}

// Resolves a URL by converting feed protocols, resolving relative URLs,
// and ensuring it's a valid HTTP(S) URL.
export const resolveUrl = (url: string, base?: string): string | undefined => {
  let processed = url

  // Step 1: Convert feed-related protocols.
  processed = resolveNonStandardFeedUrl(processed)

  // Step 2: Resolve relative URLs if base is provided.
  if (base) {
    try {
      processed = new URL(processed, base).href
    } catch {
      return
    }
  }

  // Step 3: Add protocol if missing.
  processed = addMissingProtocol(processed)

  // Step 4: Validate using URL constructor.
  try {
    const parsed = new URL(processed)

    // Reject non-HTTP(S) protocols.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return
    }

    return parsed.href
  } catch {
    return
  }
}

import type { NormalizeOptions } from './types.js'

const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  www: true,
  trailingSlash: true,
}

export const normalizeUrl = (url: string, options = defaultNormalizeOptions): string => {
  try {
    const parsed = new URL(url)

    // Lowercase hostname.
    parsed.hostname = parsed.hostname.toLowerCase()

    // Strip www prefix.
    if (options.www && parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
    }

    // Handle trailing slash.
    let pathname = parsed.pathname
    if (options.trailingSlash && pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }
    parsed.pathname = pathname

    // Build result URL.
    let result = parsed.href

    // Strip protocol for comparison.
    if (options.protocol) {
      result = result.replace(/^https?:\/\//, '')
    }

    return result
  } catch {
    return url
  }
}
