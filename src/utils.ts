import { domainToASCII } from 'node:url'
import { decodeHTML } from 'entities'
import { defaultNormalizeOptions } from './defaults.js'
import type { NormalizeOptions, PlatformHandler } from './types.js'

const strippedParamsCache = new WeakMap<Array<string>, Set<string>>()

const getStrippedParamsSet = (params: Array<string>): Set<string> => {
  let cached = strippedParamsCache.get(params)

  if (!cached) {
    cached = new Set(params.map((param) => param.toLowerCase()))
    strippedParamsCache.set(params, cached)
  }

  return cached
}

const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

// IPv6 addresses have 2-7 colons with hex segments. This is intentionally
// loose - URL constructor validates the actual format, this just filters
// obvious non-IPv6 strings like single-label hostnames.
const ipv6Pattern = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

// Characters that are safe in URL path segments and don't need percent encoding.
const safePathChars = /[a-zA-Z0-9._~!$&'()*+,;=:@-]/

// Fix common malformations in HTTP/HTTPS protocols. Handles:
// - Excess slashes: http:////example.com → http://example.com
// - Leading slash: /http://example.com → http://example.com
// - Typos in protocol: htp://, htps://, hhttps:// → http:// or https://
// - Missing colon: http//example.com → http://example.com
// - Multiple colons: http:::// → http://
// - Wrong separators: http=//, http.\\ → http://
// - Leading junk after protocol: http://./example.com → http://example.com
// - Placeholder syntax: http(s):// → https://
// - Double protocol: http:http://, https:https:// → dedupe
// - Misplaced www: https:www.// → https://www.
// - Missing www dot: https://www/ → https://www.
export const fixMalformedProtocol = (url: string): string => {
  let fixed = url

  // Strip leading slash before protocol: /http://example.com → http://example.com
  if (/^\/https?:\/\//i.test(fixed)) {
    fixed = fixed.slice(1)
  }

  // Fix placeholder syntax: http(s):// → https://
  fixed = fixed.replace(/^http\(s\):\/\//i, 'https://')

  // Fix colon within protocol letters: http:s//, ht:tps//, htt:p// → http:// or https://
  fixed = fixed.replace(/^[htps:]{3,7}\/\//i, (match) => {
    return /s/i.test(match) ? 'https://' : 'http://'
  })

  // Fix double protocol prefix: http:http://, https:https:// → keep inner
  fixed = fixed.replace(/^https?:+(https?):\/\//i, '$1://')

  // Fix misplaced www after protocol: https:www.// → https://www.
  fixed = fixed.replace(/^(https?):www\.\/\//i, '$1://www.')

  // Fix typos in protocol (htp, htps, hhttps, httpss, etc.) only when followed by ://
  // Uses presence of 's' to determine if https was intended
  fixed = fixed.replace(/^[htps]{2,7}(?=:\/\/)/i, (match) => (/s/i.test(match) ? 'https' : 'http'))

  // Fix wrong separators after protocol (http=, http., http\, etc.)
  fixed = fixed.replace(/^(https?)[:=./\\]+(?!\/)/i, '$1://')

  // Fix multiple colons and slashes: http:::/// → http://
  fixed = fixed.replace(/^(https?):+\/+/i, '$1://')

  // Remove leading dots/commas after protocol: http://./example.com → http://example.com
  fixed = fixed.replace(/^(https?:\/\/)[.,]+/i, '$1')

  // Fix missing dot after www: https://www/example.com → https://www.example.com
  fixed = fixed.replace(/^(https?:\/\/)www\//i, '$1www.')

  // Fix nested double protocols: http://https//domain → https://, http://ttp://domain → http://
  // Only matches when inner protocol-like string is followed by : or / (not . which indicates hostname)
  fixed = fixed.replace(/^[htps]{2,7}:\/\/([htps]{2,7})[:/]+/i, (_match, inner) => {
    return /s/i.test(inner) ? 'https://' : 'http://'
  })

  // Fix stray colon after protocol slashes: http://:/path → http://path
  fixed = fixed.replace(/^(https?:\/\/):\//i, '$1')

  return fixed
}

// Convert known feed-related protocols to HTTPS. Examples:
// - feed://example.com/rss.xml → https://example.com/rss.xml
// - feed:https://example.com/rss.xml → https://example.com/rss.xml
// - rss://example.com/feed.xml → https://example.com/feed.xml
// - pcast://example.com/podcast.xml → https://example.com/podcast.xml
// - itpc://example.com/podcast.xml → https://example.com/podcast.xml
const feedProtocols = ['feed:', 'rss:', 'podcast:', 'pcast:', 'itpc:']

export const resolveFeedProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
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
      return `${protocol}:${url.slice(scheme.length)}`
    }
  }

  return url
}

// Adds protocol to URLs missing a scheme. Handles both protocol-relative
// URLs (//example.com) and bare domains (example.com). Examples:
// - //example.com/feed → https://example.com/feed
// - //localhost/api → https://localhost/api
// - //Users/file.xml → //Users/file.xml (unchanged, not a valid URL)
// - example.com/feed → https://example.com/feed
// - /path/to/feed → /path/to/feed (unchanged, relative path)
export const addMissingProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  // Skip if URL already has a real protocol (http://, mailto:, tel:, etc.).
  // URL constructor may incorrectly parse "example.com:8080" as protocol "example.com:"
  // or "localhost:3000" as "localhost:". Real URI schemes don't contain dots (RFC 3986),
  // so a dot in the protocol reveals it was actually a hostname:port, not a scheme.
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

      // Valid web hostnames must have at least one of:
      // Note: IPv6 hostnames include brackets (e.g., [::1]), strip them for pattern matching.
      if (
        hostname.includes('.') ||
        hostname === 'localhost' ||
        ipv4Pattern.test(hostname) ||
        ipv6Pattern.test(hostname.replace(/^\[|\]$/g, ''))
      ) {
        return parsed.href
      }

      return url
    } catch {
      return url
    }
  }

  // Case 2: Bare domain (example.com/feed).
  // Skip if is a path.
  if (url.startsWith('/') || url.startsWith('.')) {
    return url
  }

  // Dot must be in the hostname (before first slash), not in the path.
  const slashIndex = url.indexOf('/')
  const dotIndex = url.indexOf('.')
  if (dotIndex === -1 || (slashIndex !== -1 && dotIndex > slashIndex)) {
    // Exception: localhost is valid without a dot.
    if (!url.startsWith('localhost')) {
      return url
    }
  }

  // Check if it looks like a domain (no spaces or special chars at start).
  const firstChar = url.charAt(0)
  if (firstChar === ' ' || firstChar === '\t' || firstChar === '\n') {
    return url
  }

  return `${protocol}://${url}`
}

// Resolves a URL by converting feed protocols, resolving relative URLs,
// and ensuring it's a valid HTTP(S) URL.
export const resolveUrl = (url: string, base?: string): string | undefined => {
  let resolvedUrl: string | undefined

  // Step 1: Decode HTML entities to recover the intended URL.
  // URLs in XML/HTML are often entity-encoded (e.g., &amp; for &).
  resolvedUrl = url.includes('&') ? decodeHTML(url) : url

  // Step 2: Convert feed-related protocols.
  resolvedUrl = resolveFeedProtocol(resolvedUrl)

  // Step 3: Fix malformed HTTP/HTTPS protocols.
  resolvedUrl = fixMalformedProtocol(resolvedUrl)

  // Step 4: Resolve relative URLs if base is provided.
  if (base) {
    try {
      resolvedUrl = new URL(resolvedUrl, base).href
    } catch {
      return
    }
  }

  // Step 5: Add protocol if missing (handles both // and bare domains).
  resolvedUrl = addMissingProtocol(resolvedUrl)

  // Step 6: Validate using native URL constructor.
  try {
    const parsed = new URL(resolvedUrl)

    // Reject non-HTTP(S) protocols.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return
    }

    return parsed.href
  } catch {
    return
  }
}

const decodeAndNormalizeEncoding = (value: string): string => {
  if (!value.includes('%')) {
    return value
  }

  // Decodes unnecessarily percent-encoded characters and normalizes encoding to uppercase.
  return value.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex) => {
    const charCode = Number.parseInt(hex, 16)
    const char = String.fromCharCode(charCode)

    // Decode if it's a safe character that doesn't need encoding.
    if (safePathChars.test(char)) {
      return char
    }

    // Keep encoded but normalize to uppercase.
    return `%${hex.toUpperCase()}`
  })
}

export const normalizeUrl = (
  url: string,
  options: NormalizeOptions = defaultNormalizeOptions,
): string => {
  try {
    const parsed = new URL(url)

    // Unicode normalization.
    if (options.normalizeUnicode) {
      parsed.hostname = parsed.hostname.normalize('NFC')
      parsed.pathname = parsed.pathname.normalize('NFC')
    }

    // Punycode normalization (IDN to ASCII).
    if (options.convertToPunycode) {
      const ascii = domainToASCII(parsed.hostname)
      if (ascii) {
        parsed.hostname = ascii
      }
    }

    // Strip authentication.
    if (options.stripAuthentication) {
      parsed.username = ''
      parsed.password = ''
    }

    // Strip www prefix.
    if (options.stripWww && parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
    }

    // Strip hash/fragment.
    if (options.stripHash) {
      parsed.hash = ''
    }

    // Handle pathname normalization.
    let pathname = parsed.pathname

    // Normalize percent encoding (decode unnecessarily encoded chars, uppercase hex).
    if (options.normalizeEncoding) {
      pathname = decodeAndNormalizeEncoding(pathname)
    }

    // Collapse multiple slashes.
    if (options.collapseSlashes) {
      pathname = pathname.replace(/\/+/g, '/')
    }

    // Handle trailing slash.
    if (options.stripTrailingSlash && pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }

    // Handle single slash (root path).
    if (options.stripRootSlash && pathname === '/') {
      pathname = ''
    }

    parsed.pathname = pathname

    // Strip entire query string.
    if (options.stripQuery) {
      parsed.search = ''
    }

    // Remove tracking/specified parameters (case-insensitive).
    if (options.stripQueryParams && parsed.search) {
      const strippedSet = getStrippedParamsSet(options.stripQueryParams)
      const paramsToDelete: Array<string> = []

      for (const [key] of parsed.searchParams) {
        if (strippedSet.has(key.toLowerCase())) {
          paramsToDelete.push(key)
        }
      }

      for (const param of paramsToDelete) {
        parsed.searchParams.delete(param)
      }
    }

    // Sort query parameters.
    if (options.sortQueryParams) {
      parsed.searchParams.sort()
    }

    // Remove empty query string.
    if (options.stripEmptyQuery && parsed.href.endsWith('?')) {
      parsed.search = ''
    }

    // Build result URL.
    let result = parsed.href

    // Strip root slash: URL.href always includes "/" for root paths.
    if (options.stripRootSlash && result === `${parsed.origin}/`) {
      result = parsed.origin
    }

    // Strip protocol for comparison.
    if (options.stripProtocol) {
      result = result.replace(/^https?:\/\//, '')
    }

    return result
  } catch {
    return url
  }
}

export const applyPlatformHandlers = (url: string, platforms: Array<PlatformHandler>): string => {
  try {
    let parsed = new URL(url)

    for (const handler of platforms) {
      if (handler.match(parsed)) {
        parsed = handler.normalize(parsed)
        break
      }
    }

    return parsed.href
  } catch {
    return url
  }
}
