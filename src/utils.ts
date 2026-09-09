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

const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i

// https://www.rfc-editor.org/rfc/rfc3986#section-3.3: the pchar set, which needs no escaping.
const safePathCharsRegex = /[a-zA-Z0-9._~!$&'()*+,;=:@-]/
const httpsLetterRegex = /s/i
const protocolPrefixRegex = /^https?:\/\//
const wwwPrefixRegex = /^www\./
const percentEscapeOrLettersRegex = /%[0-9A-Fa-f]{2}|[A-Z]+/g
const plusRegex = /\+/g
const httpProtocolRegex = /^http:\/\//i
const httpsProtocolRegex = /^https:\/\//i

// A lone w after the scheme falls through, or https://www/ would keep its missing dot.
const validUrlRegex = /^https?:\/\/(?:www\.|[a-vx-z0-9])/i

// Two run-together protocols such as http:http:// or htp://ttps://, capturing the inner one.
const doubledProtocolRegex = /^\/?[htps]{2,7}[:\s=.\\/]+([htps]{2,7})[:\s=.\\/]+[.,:/]*(www[./]+)?/i

// One garbled protocol such as htp://, http:s// or tps://, then an optional www missing its dot.
const singleMalformedRegex = /^\/?(?:h[htps():]{1,10}|t{1,2}ps?)[:\s=.\\/]+[.,:/]*(www[./]+)?/i

// Hand-typed feed urls arrive with the scheme doubled, misspelled or slash-starved.
export const fixMalformedProtocol = (url: string): string => {
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

const feedProtocols = [
  'feed:',
  'rss:',
  'podcast:',
  'podcasts:',
  'pcast:',
  'itpc:',
  'itms:',
  'itms-pcast:',
  'itms-pcasts:',
  'itms-podcast:',
  'itms-podcasts:',
]

// Subscribe links wrap or replace http(s) with feed://, rss://, pcast:// and the iTunes schemes.
export const resolveFeedProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  // `| 32` lowercases an ASCII letter.
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

    if (urlLower.startsWith(`${scheme}http://`) || urlLower.startsWith(`${scheme}https://`)) {
      return url.slice(scheme.length)
    }

    if (urlLower.startsWith(`${scheme}//`)) {
      return `${protocol}:${url.slice(scheme.length)}`
    }
  }

  return url
}

// Feed lists hold bare domains and protocol-relative urls, which the URL parser rejects.
export const addMissingProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  // example.com:8080 has a colon too, and no registered scheme carries a dot or a slash.
  const colonIndex = url.indexOf(':')

  if (colonIndex > 0) {
    const beforeColon = url.slice(0, colonIndex)
    const hasScheme =
      !beforeColon.includes('.') && !beforeColon.includes('/') && beforeColon !== 'localhost'

    if (hasScheme) {
      return url
    }
  }

  if (url.startsWith('//') && !url.startsWith('///')) {
    const parsed = parseUrl(`${protocol}:${url}`)

    if (!parsed) {
      return url
    }

    const hostname = parsed.hostname

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

  if (url.startsWith('/') || url.startsWith('.')) {
    return url
  }

  const slashIndex = url.indexOf('/')
  const dotIndex = url.indexOf('.')
  if (dotIndex === -1 || (slashIndex !== -1 && dotIndex > slashIndex)) {
    if (!url.startsWith('localhost')) {
      return url
    }
  }

  const firstChar = url.charAt(0)
  if (firstChar === ' ' || firstChar === '\t' || firstChar === '\n') {
    return url
  }

  return `${protocol}://${url}`
}

// The same url on the other http scheme. Other schemes and protocol-relative urls come back as is.
export const upgradeProtocol = (url: string, protocol: 'http' | 'https' = 'https'): string => {
  if (protocol === 'https') {
    return url.replace(httpProtocolRegex, 'https://')
  }

  return url.replace(httpsProtocolRegex, 'http://')
}

// A feed's urls arrive entity-encoded, feed-schemed, garbled or relative, and some are not urls.
export const resolveUrl = (url: string, base?: string): string | undefined => {
  if (url.startsWith('#') && !base) {
    return
  }

  let resolvedUrl: string | undefined

  // Loose entity decoding would turn ?id=1&copy=2 into ?id=1©=2.
  resolvedUrl = url.includes('&') ? decodeHTMLStrict(url) : url

  resolvedUrl = resolveFeedProtocol(resolvedUrl)

  resolvedUrl = fixMalformedProtocol(resolvedUrl)

  if (base) {
    const resolved = parseUrl(resolvedUrl, base)

    if (!resolved) {
      return
    }

    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.href
    }

    resolvedUrl = resolved.href
  }

  resolvedUrl = addMissingProtocol(resolvedUrl)

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

  return value.replace(/%([0-9A-Fa-f]{2})/g, (_match, hex) => {
    const charCode = Number.parseInt(hex, 16)
    const char = String.fromCharCode(charCode)

    if (safePathCharsRegex.test(char)) {
      return char
    }

    return `%${hex.toUpperCase()}`
  })
}

const decodeQueryKey = (pair: string): string => {
  const key = pair.split('=')[0].replace(plusRegex, ' ')

  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

const compareQueryPairs = (a: string, b: string): number => {
  const keyA = decodeQueryKey(a)
  const keyB = decodeQueryKey(b)

  if (keyA < keyB) {
    return -1
  }

  if (keyA > keyB) {
    return 1
  }

  return 0
}

const lowercaseQueryPair = (pair: string): string => {
  return pair.replace(percentEscapeOrLettersRegex, (match) => {
    return match.startsWith('%') ? match : match.toLowerCase()
  })
}

// A url reshaped by the given options, or the input as it came when it does not parse.
export const normalizeUrl = (
  url: string,
  options: NormalizeOptions = defaultNormalizeOptions,
): string => {
  try {
    const parsed = new URL(url)

    if (options.normalizeUnicode) {
      parsed.hostname = parsed.hostname.normalize('NFC')
      parsed.pathname = parsed.pathname.normalize('NFC')
    }

    if (options.stripAuthentication) {
      parsed.username = ''
      parsed.password = ''
    }

    if (options.stripWww && parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
    }

    if (options.stripHash) {
      parsed.hash = ''
    }

    let pathname = parsed.pathname

    if (options.normalizeEncoding) {
      pathname = decodeAndNormalizeEncoding(pathname)
    }

    if (options.collapseSlashes) {
      pathname = pathname.replace(/\/+/g, '/')
    }

    if (options.stripTrailingSlash && pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }

    if (options.stripRootSlash && pathname === '/') {
      pathname = ''
    }

    parsed.pathname = pathname

    if (options.stripQuery) {
      parsed.search = ''
    }

    // searchParams would turn a bare query like ?/feeds/atom10.xml into ?%2Ffeeds%2Fatom10.xml=.
    if (parsed.search && (options.stripQueryParams || options.lowercaseQuery)) {
      let pairs = parsed.search.slice(1).split('&')

      if (options.stripQueryParams) {
        const strippedSet = getStrippedParamsSet(options.stripQueryParams)
        pairs = pairs.filter((pair) => !strippedSet.has(decodeQueryKey(pair).toLowerCase()))
      }

      if (options.lowercaseQuery) {
        pairs = pairs.map(lowercaseQueryPair)
      }

      parsed.search = pairs.join('&')
    }

    // Without dropping empty pairs, ?b=1& sorts into ?&b=1.
    if (options.sortQueryParams && parsed.search.includes('&')) {
      const pairs = parsed.search.slice(1).split('&').filter(Boolean)
      parsed.search = pairs.sort(compareQueryPairs).join('&')
    }

    if (options.stripEmptyQuery && parsed.href.endsWith('?')) {
      parsed.search = ''
    }

    let result = parsed.href

    // URL.href puts the root slash back after the pathname is emptied.
    if (options.stripRootSlash && result === `${parsed.origin}/`) {
      result = parsed.origin
    }

    if (options.stripProtocol) {
      result = result.replace(protocolPrefixRegex, '')
    }

    return result
  } catch {
    return url
  }
}

// The url after the first rewrite whose match claims it. Later rewrites never see the result.
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

// The first candidate the callback accepts from the first probe that matches the url.
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

      break
    }

    return url
  } catch {
    return url
  }
}

// A JSON fingerprint of a feed with its named top-level fields left out.
export const createSignature = <T extends Record<string, unknown>>(
  object: T,
  fields: Array<keyof T>,
): string => {
  const excluded = new Set(fields)

  // Without the `this` check, a same-named key on a nested item would drop too.
  return JSON.stringify(object, function (this: unknown, key, value) {
    return this === object && excluded.has(key as keyof T) ? undefined : value
  })
}

const urlSchemeRegex = /https?:\/\//gi
const urlDelimiterRegex = /[\s"'<>\\}]/g
// A quoted url or root path with a trailing slash before its query or closing quote.
const trailingSlashRegex = /("(?:https?:\/\/|\/)[^"]+)\/([?"])/g

const neutralizeHost = (url: string): string | undefined => {
  return parseUrl(url)?.host.replace(wwwPrefixRegex, '').toLowerCase()
}

// Feed text with its own urls cut to root-relative paths, so scheme, www and slash forms agree.
export const neutralizeUrls = (text: string, urls: Array<string>): string => {
  const hosts = new Set(urls.map(neutralizeHost).filter(Boolean))
  if (hosts.size === 0) {
    return text
  }

  let result = ''
  let lastIndex = 0
  urlSchemeRegex.lastIndex = 0

  for (let match = urlSchemeRegex.exec(text); match; match = urlSchemeRegex.exec(text)) {
    const start = match.index

    if (start < lastIndex) {
      continue
    }

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
