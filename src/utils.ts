import type { MaybePromise } from 'trousse'
import { addMissingProtocol, parseUrl, stripWww } from 'trousse'
import type { Probe, Rewrite } from './types.js'

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
  let candidates: Array<string>

  // Only probe errors are swallowed. Errors from testCandidate carry the caller's callbacks.
  try {
    const parsed = new URL(url)
    // First matching probe wins.
    const probe = probes.find((probe) => probe.match(parsed))
    candidates = probe ? probe.getCandidates(parsed) : []
  } catch {
    return url
  }

  for (const candidate of candidates) {
    const result = await testCandidate(candidate)

    if (result) {
      return result
    }
  }

  return url
}

// A registered relation name equals its IANA IRI form (RFC 4287 §4.2.7.2) and compares
// case-insensitively (RFC 8288 §2.1.1).
export const isRelation = (rel: string, name: string): boolean => {
  return rel.toLowerCase() === name || rel === `http://www.iana.org/assignments/relation/${name}`
}

// A link is `<uri-reference>` followed by parameters, which may hold commas inside quoted strings.
const linkRegex = /<(?<target>[^>]*)>(?<params>(?:"[^"]*"|[^,"])*)/g
const relParamRegex = /;\s*rel\s*=\s*(?:"(?<quoted>[^"]*)"|(?<token>[^\s;]+))/i
const whitespaceRegex = /\s+/

// The target of the first link in a Link header whose rel includes "self".
// See: https://www.rfc-editor.org/rfc/rfc8288#section-3.
export const getLinkHeaderSelfUrl = (header: string | null): string | undefined => {
  if (!header) {
    return
  }

  for (const link of header.matchAll(linkRegex)) {
    const rel = link.groups?.params.match(relParamRegex)
    const relTypes = (rel?.groups?.quoted ?? rel?.groups?.token)?.split(whitespaceRegex)

    if (relTypes?.some((relType) => isRelation(relType, 'self'))) {
      return link.groups?.target.trim()
    }
  }
}

export const createSignature = (
  object: object,
  exclusions: Array<[holder: object | undefined, key: string]>,
): string => {
  // `this` is the holder of each property, so a pair omits the key only on its own object, never a
  // same-named key elsewhere. Nothing is mutated, so the input stays intact even if serialization
  // throws.
  return JSON.stringify(object, function (this: unknown, key, value) {
    const isExcluded = exclusions.some(([holder, excludedKey]) => {
      return holder === this && excludedKey === key
    })

    return isExcluded ? undefined : value
  })
}

// Static, so no ReDoS risk. A URL token runs to the next quote, whitespace, angle bracket, backslash
// or `}`. A `//` after a word character is a doubled slash in a path, and after a colon another
// scheme, so neither starts a protocol-relative URL.
const urlSchemeRegex = /(?:https?:|(?<![\w:]))\/\//gi
const urlDelimiterRegex = /[\s"'<>\\}]/g
// The authority runs to the first `/`, `?` or `#`, and the match keeps that character so the parser
// cannot trim a trailing control character the full token would reject. After an explicit scheme
// the parser skips any further slashes before the host.
const relativeAuthorityRegex = /[^/?#\s"'<>\\}]*[/?#]?/y
const schemeAuthorityRegex = /\/*[^/?#\s"'<>\\}]*[/?#]?/y
// Strips a trailing slash from any URL or root-relative path before a quote or query. Static and
// linear (the prior ReDoS lived only in the per-host pattern, now removed).
const trailingSlashRegex = /("(?:https?:\/\/|\/)[^"]+)\/([?"])/g

const neutralizeHost = (url: string): string | undefined => {
  const host = parseUrl(addMissingProtocol(url))?.host

  if (!host) {
    return
  }

  return stripWww(host).toLowerCase()
}

export const neutralizeUrls = (text: string, urls: Array<string>): string => {
  // Rewrites each occurrence of a feed's own URL to a root-relative form, so content differing only
  // in URL form (http/https, www/non-www, trailing slash, host casing) produces identical output.
  // Each URL is located by scanning for the scheme and parsed with the URL API for host comparison:
  // the feed-supplied host is never interpolated into a pattern, which is what previously made this
  // a ReDoS injection point.
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

    // A host check on the full token would re-parse most of a long token once per `//` inside it.
    const authorityRegex = match[0].length > 2 ? schemeAuthorityRegex : relativeAuthorityRegex
    authorityRegex.lastIndex = start + match[0].length
    authorityRegex.exec(text)

    if (!hosts.has(neutralizeHost(text.slice(start, authorityRegex.lastIndex)))) {
      continue
    }

    // Find the next delimiter with one regex search instead of a per-character test.
    urlDelimiterRegex.lastIndex = start

    const delimiterMatch = urlDelimiterRegex.exec(text)
    const end = delimiterMatch ? delimiterMatch.index : text.length

    const parsed = parseUrl(addMissingProtocol(text.slice(start, end)))

    if (!parsed) {
      continue
    }

    if (!hosts.has(stripWww(parsed.host).toLowerCase())) {
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
