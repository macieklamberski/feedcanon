import { decodeHTMLStrict } from 'entities'
import { parseUrl } from 'trousse'
import { defaultNormalizeOptions } from './defaults.js'
import type { MaybePromise, NormalizeOptions, Probe, Rewrite } from './types.js'

const strippedParamsCache = new WeakMap<Array<string>, Set<string>>()

const getStrippedParamsSet = (params: Array<string>): Set<string> => {
  let cached = strippedParamsCache.get(params)

  if (!cached) {
    cached = new Set(params.map((param) => param.toLowerCase()))
    strippedParamsCache.set(params, cached)
  }

  return cached
}

const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

// IPv6 addresses have 2-7 colons with hex segments. This is intentionally
// loose - URL constructor validates the actual format, this just filters
// obvious non-IPv6 strings like single-label hostnames.
const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

// Characters that are safe in URL path segments and don't need percent encoding.
const safePathCharsRegex = /[a-zA-Z0-9._~!$&'()*+,;=:@-]/
const httpsLetterRegex = /s/i
const protocolPrefixRegex = /^https?:\/\//
const wwwPrefixRegex = /^www\./
const httpProtocolRegex = /^http:\/\//i
const httpsProtocolRegex = /^https:\/\//i

// Pre-compiled patterns for fixMalformedProtocol.
// Fast path: valid http(s):// followed by hostname char (excludes lone 'w' to avoid partial 'www').
const validUrlRegex = /^https?:\/\/(?:www\.|[a-vx-z0-9])/i

// Doubled/nested protocol pattern - captures the INNER protocol which takes precedence.
// Matches: http:http://, https:https://, http://https//, htp://ttps://, etc.
const doubledProtocolRegex = /^\/?[htps]{2,7}[:\s=.\\/]+([htps]{2,7})[:\s=.\\/]+[.,:/]*(www[./]+)?/i

// Single malformed protocol pattern - for typos, wrong separators, etc.
// Must start with h (or /h) to be HTTP-like. Allows colons within letters (http:s//).
const singleMalformedRegex = /^\/?(?:h[htps():]{1,10}|t{1,2}ps?)[:\s=.\\/]+[.,:/]*(www[./]+)?/i

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
  // Fast path: valid URL without doubled protocol.
  if (validUrlRegex.test(url) && !doubledProtocolRegex.test(url)) {
    return url
  }

  const doubledMatch = doubledProtocolRegex.exec(url)
  if (doubledMatch) {
    const inner = doubledMatch[1]
    const www = doubledMatch[2]
    const rest = url.slice(doubledMatch[0].length)
    const protocol = httpsLetterRegex.test(inner) ? 'https://' : 'http://'
    return protocol + (www ? 'www.' : '') + rest
  }

  const singleMatch = singleMalformedRegex.exec(url)
  if (singleMatch) {
    const fullMatch = singleMatch[0]
    const www = singleMatch[1]
    const rest = url.slice(fullMatch.length)
    const protocol = httpsLetterRegex.test(fullMatch) ? 'https://' : 'http://'
    return protocol + (www ? 'www.' : '') + rest
  }

  return url
}

// Convert known feed-related protocols to HTTPS. Examples:
// - feed://example.com/rss.xml → https://example.com/rss.xml
// - feed:https://example.com/rss.xml → https://example.com/rss.xml
// - rss://example.com/feed.xml → https://example.com/feed.xml
// - pcast://example.com/podcast.xml → https://example.com/podcast.xml
// - itpc://example.com/podcast.xml → https://example.com/podcast.xml
const feedProtocols = ['feed:', 'rss:', 'podcast:', 'pcast:', 'itpc:']

export const resolveFeedProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  // Feed schemes start with f, r, p, or i, so anything else returns before lowercasing
  // the whole URL. `| 32` lowercases an ASCII letter.
  const firstCharCode = url.charCodeAt(0) | 32

  if (
    firstCharCode !== 102 && // f
    firstCharCode !== 114 && // r
    firstCharCode !== 112 && // p
    firstCharCode !== 105 // i
  ) {
    return url
  }

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
  // Skip if URL already has a real protocol. No registered IANA scheme contains
  // a dot or slash, so "example.com:8080" won't false-positive as a scheme.
  const colonIndex = url.indexOf(':')

  if (colonIndex > 0) {
    const beforeColon = url.slice(0, colonIndex)
    const hasScheme =
      !beforeColon.includes('.') && !beforeColon.includes('/') && beforeColon !== 'localhost'

    if (hasScheme) {
      return url
    }
  }

  // Case 1: Protocol-relative URL (//example.com).
  if (url.startsWith('//') && !url.startsWith('///')) {
    const parsed = parseUrl(`${protocol}:${url}`)

    if (!parsed) {
      return url
    }

    const hostname = parsed.hostname

    // Valid web hostnames must have at least one of:
    // Note: IPv6 hostnames include brackets (e.g., [::1]), strip them for pattern matching.
    if (
      hostname.includes('.') ||
      hostname === 'localhost' ||
      ipv4Regex.test(hostname) ||
      ipv6Regex.test(hostname.replace(/^\[|\]$/g, ''))
    ) {
      return parsed.href
    }

    return url
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

// Swaps an existing HTTP(S) protocol on a URL. Unlike `addMissingProtocol`,
// which only acts when the protocol is absent, this rewrites the scheme
// when one is already present. Protocol-relative URLs (`//host`) and
// non-HTTP schemes (`mailto:`, `data:`, `ftp://`) are left unchanged.
// Case-insensitive on the matched protocol; only the leading scheme is
// touched, not any later `http://` substring inside the path or query.
export const upgradeProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  if (protocol === 'https') {
    return url.replace(httpProtocolRegex, 'https://')
  }

  return url.replace(httpsProtocolRegex, 'http://')
}

// Resolves a URL by converting feed protocols, resolving relative URLs,
// and ensuring it's a valid HTTP(S) URL.
export const resolveUrl = (url: string, base?: string): string | undefined => {
  // Fragment-only URLs can only be resolved against a base URL.
  if (url.startsWith('#') && !base) {
    return
  }

  let resolvedUrl: string | undefined

  // Step 1: Decode HTML entities to recover the intended URL.
  // URLs in XML/HTML are often entity-encoded (e.g., &amp; for &). Strict decoding only
  // expands entities with a trailing semicolon, so a query parameter whose name matches an
  // entity (e.g. `?id=1&copy=2`) is left intact instead of being mangled into `?id=1©=2`.
  resolvedUrl = url.includes('&') ? decodeHTMLStrict(url) : url

  // Step 2: Convert feed-related protocols.
  resolvedUrl = resolveFeedProtocol(resolvedUrl)

  // Step 3: Fix malformed HTTP/HTTPS protocols.
  resolvedUrl = fixMalformedProtocol(resolvedUrl)

  // Step 4: Resolve relative URLs if base is provided.
  if (base) {
    const resolved = parseUrl(resolvedUrl, base)

    if (!resolved) {
      return
    }

    // An absolute http(s) href needs no protocol repair and reparsing it changes
    // nothing, so return it directly.
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.href
    }

    resolvedUrl = resolved.href
  }

  // Step 5: Add protocol if missing (handles both // and bare domains).
  resolvedUrl = addMissingProtocol(resolvedUrl)

  // Step 6: Validate and reject non-HTTP(S) protocols.
  const parsed = parseUrl(resolvedUrl)

  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return
  }

  return parsed.href
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
    if (safePathCharsRegex.test(char)) {
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

    // Lowercase query parameters.
    if (options.lowercaseQuery && parsed.search) {
      const entries = [...parsed.searchParams.entries()]
      parsed.search = ''
      for (const [key, value] of entries) {
        parsed.searchParams.append(key.toLowerCase(), value.toLowerCase())
      }
    }

    // Sort query parameters.
    if (options.sortQueryParams && parsed.search) {
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
      result = result.replace(protocolPrefixRegex, '')
    }

    return result
  } catch {
    return url
  }
}

export const applyRewrites = (url: string, rewrites: Array<Rewrite>): string => {
  try {
    let parsed = new URL(url)

    for (const rewrite of rewrites) {
      if (rewrite.match(parsed)) {
        parsed = rewrite.rewrite(parsed)
        break
      }
    }

    return parsed.href
  } catch {
    return url
  }
}

// Apply URL probes, testing each candidate via callback.
// Returns first working candidate URL, or original if none work.
export const applyProbes = async (
  url: string,
  probes: Array<Probe>,
  testCandidate: (url: string) => MaybePromise<string | undefined>,
): Promise<string> => {
  try {
    const parsed = new URL(url)

    for (const probe of probes) {
      if (!probe.match(parsed)) {
        continue
      }

      for (const candidate of probe.getCandidates(parsed)) {
        const result = await testCandidate(candidate)

        if (result) {
          return result
        }
      }

      // First matching probe wins.
      break
    }

    return url
  } catch {
    return url
  }
}

export const createSignature = <T extends Record<string, unknown>>(
  object: T,
  fields: Array<keyof T>,
): string => {
  const excluded = new Set(fields)

  // Omit the named top-level fields via a replacer instead of mutating the object.
  // `this` is the holder of each property, so `this === object` matches only the
  // root's own fields, leaving same-named keys on nested items untouched. This keeps
  // the input feed object intact even if serialization throws, and adds no copy.
  return JSON.stringify(object, function (this: unknown, key, value) {
    return this === object && excluded.has(key as keyof T) ? undefined : value
  })
}

// Static pattern that locates the start of each absolute HTTP(S) URL in feed text.
// Fixed and never built from feed input, so it carries no ReDoS risk. A URL token runs
// from a match to the next delimiter (quote, whitespace, angle bracket, backslash, `}`).
const urlSchemeRegex = /https?:\/\//gi
const urlDelimiterRegex = /[\s"'<>\\}]/g
// Strips a trailing slash from any URL or root-relative path before a quote or query.
// Static and linear (the prior ReDoS lived only in the per-host pattern, now removed).
const trailingSlashRegex = /("(?:https?:\/\/|\/)[^"]+)\/([?"])/g

const neutralizeHost = (url: string): string | undefined => {
  return parseUrl(url)?.host.replace(wwwPrefixRegex, '').toLowerCase()
}

export const neutralizeUrls = (text: string, urls: Array<string>): string => {
  // Rewrites each occurrence of a feed's own URL to a root-relative form, so content
  // differing only in URL form (http/https, www/non-www, trailing slash, host casing)
  // produces identical output. Each URL is located by scanning for the scheme and parsed
  // with the URL API for host comparison — the feed-supplied host is never interpolated
  // into a pattern, which is what previously made this a ReDoS injection point.
  const hosts = new Set(urls.map(neutralizeHost).filter(Boolean))
  if (hosts.size === 0) {
    return text
  }

  let result = ''
  let lastIndex = 0
  urlSchemeRegex.lastIndex = 0

  for (let match = urlSchemeRegex.exec(text); match; match = urlSchemeRegex.exec(text)) {
    const start = match.index

    // Skip schemes inside a URL that was already rewritten (e.g. a nested URL in a query).
    if (start < lastIndex) {
      continue
    }

    // Find the next delimiter with one regex search instead of a per-character test.
    urlDelimiterRegex.lastIndex = start

    const delimiterMatch = urlDelimiterRegex.exec(text)
    const end = delimiterMatch ? delimiterMatch.index : text.length

    const parsed = parseUrl(text.slice(start, end))

    if (!parsed) {
      continue
    }

    if (!hosts.has(parsed.host.replace(wwwPrefixRegex, '').toLowerCase())) {
      continue
    }

    // Root-relative form with the trailing slash collapsed (the root path stays `/`).
    let path = parsed.pathname
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }

    result += text.slice(lastIndex, start) + path + parsed.search + parsed.hash
    lastIndex = end
  }

  result += text.slice(lastIndex)

  return result.replace(trailingSlashRegex, '$1$2')
}
