import { parseFeed } from 'feedsmith'
import { type NormalizeOptions, parseUrl, resolveUrl } from 'trousse'
import type { DefaultParserResult, FetchFn, ParserAdapter, Tier } from './types.js'
import { createSignature, neutralizeUrls } from './utils.js'

export const defaultNormalizeOptions: NormalizeOptions = {
  stripProtocol: true,
  stripAuthentication: false,
  stripWww: true,
  stripTrailingSlash: true,
  stripRootSlash: true,
  collapseSlashes: true,
  stripHash: true,
  sortQueryParams: true,
  stripQuery: false,
  stripEmptyQuery: true,
  lowercaseQuery: false,
  normalizeEncoding: true,
  normalizeUnicode: true,
}

// See: https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1.
const defaultAccept =
  'application/atom+xml, application/rss+xml, application/feed+json, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.1'

export const defaultFetch: FetchFn = async (url, options) => {
  const headers = new Headers(options?.headers)

  if (!headers.has('accept')) {
    headers.set('accept', defaultAccept)
  }

  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body,
    signal: AbortSignal.timeout(30_000),
  })

  return {
    headers: response.headers,
    body: await response.text(),
    url: response.url,
    status: response.status,
  }
}

// A registered relation name equals its IANA IRI form (RFC 4287 §4.2.7.2) and compares
// case-insensitively (RFC 8288 §2.1.1).
const isRelation = (rel: string, name: string): boolean => {
  return rel.toLowerCase() === name || rel === `http://www.iana.org/assignments/relation/${name}`
}

const retrieveSelfLink = (parsed: DefaultParserResult) => {
  switch (parsed.format) {
    case 'atom':
      return parsed.feed.links?.find((link) => link.rel && isRelation(link.rel, 'self'))
    case 'rss':
    case 'rdf':
      return parsed.feed.atom?.links?.find((link) => link.rel && isRelation(link.rel, 'self'))
  }
}

const retrieveAlternateLink = (feed: Extract<DefaultParserResult, { format: 'atom' }>['feed']) => {
  // A link without rel is an alternate link per RFC 4287 §4.2.7.2.
  return feed.links?.find((link) => isRelation(link.rel ?? 'alternate', 'alternate'))
}

export const defaultParser: ParserAdapter<DefaultParserResult> = {
  parse: (body) => {
    try {
      return parseFeed(body)
    } catch {}
  },
  getSelfUrl: (parsed, url) => {
    // See: https://www.jsonfeed.org/version/1.1/, the feed_url field.
    if (parsed.format === 'json') {
      return parsed.feed.feed_url
    }

    const href = retrieveSelfLink(parsed)?.href
    const base = parsed.feed.xml?.base

    if (!href || !base) {
      return href
    }

    // Without the retrieval URL, only an absolute xml:base can resolve the href.
    if (!url && !parseUrl(base)) {
      return href
    }

    // A relative href resolves against xml:base, itself resolved against the retrieval URL (RFC
    // 4287 §2, RFC 3986 §5.1). Feedsmith keeps only the root element's xml:base.
    const baseUrl = resolveUrl(base, url) ?? url

    if (!baseUrl) {
      return href
    }

    return resolveUrl(href, baseUrl)
  },
  getSignature: (parsed, url) => {
    // Neutralize dynamic fields before generating signature to ensure feeds that differ only in
    // self URL or timestamps are considered semantically identical.

    let signature: string
    let contentUrl: string | undefined

    if (parsed.format === 'json') {
      contentUrl = parsed.feed.home_page_url
      signature = createSignature(parsed.feed, [[parsed.feed, 'feed_url']])
    } else {
      const selfLink = retrieveSelfLink(parsed)

      if (parsed.format === 'rss') {
        contentUrl = parsed.feed.link
        signature = createSignature(parsed.feed, [
          [parsed.feed, 'lastBuildDate'],
          [parsed.feed, 'pubDate'],
          [parsed.feed, 'link'],
          [parsed.feed, 'generator'],
          [parsed.feed.dc, 'dates'],
          [selfLink, 'href'],
        ])
      } else if (parsed.format === 'rdf') {
        contentUrl = parsed.feed.link
        signature = createSignature(parsed.feed, [
          [parsed.feed, 'link'],
          [parsed.feed.dc, 'dates'],
          [selfLink, 'href'],
        ])
      } else {
        contentUrl = retrieveAlternateLink(parsed.feed)?.href
        signature = createSignature(parsed.feed, [
          [parsed.feed, 'updated'],
          [parsed.feed, 'generator'],
          [selfLink, 'href'],
        ])
      }
    }

    const urls = contentUrl ? [url, contentUrl] : [url]
    return neutralizeUrls(signature, urls)
  },
}

// URL tiers ordered from cleanest to least clean.
export const defaultTiers: Array<Tier> = [
  // Tier 1: Most aggressive - strip query, www, and trailing slash.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: true,
    stripTrailingSlash: true,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: false,
    stripQuery: true,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
  },
  // Tier 2: Strip www and trailing slash, keep query.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: true,
    stripTrailingSlash: true,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
  },
  // Tier 3: Keep www, strip trailing slash, keep query.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: false,
    stripTrailingSlash: true,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
  },
  // Tier 4: Keep www and trailing slash, keep query.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: false,
    stripTrailingSlash: false,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
  },
]
