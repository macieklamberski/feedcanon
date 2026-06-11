import { parseFeed } from 'feedsmith'
import type {
  DefaultParserResult,
  FetchFn,
  NormalizeOptions,
  ParserAdapter,
  Tier,
} from './types.js'
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

export const defaultFetch: FetchFn = async (url, options) => {
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: options?.headers,
  })

  return {
    headers: response.headers,
    body: await response.text(),
    url: response.url,
    status: response.status,
  }
}

const retrieveSelfLink = (parsed: DefaultParserResult) => {
  switch (parsed.format) {
    case 'atom':
      return parsed.feed.links?.find((link) => link.rel === 'self')
    case 'rss':
    case 'rdf':
      return parsed.feed.atom?.links?.find((link) => link.rel === 'self')
  }
}

export const defaultParser: ParserAdapter<DefaultParserResult> = {
  parse: (body) => {
    try {
      return parseFeed(body)
    } catch {}
  },
  getSelfUrl: (parsed) => {
    return parsed.format === 'json' ? parsed.feed.feed_url : retrieveSelfLink(parsed)?.href
  },
  getSignature: (parsed, url) => {
    // Neutralize dynamic fields before generating signature to ensure feeds
    // that differ only in self URL or timestamps are considered semantically identical.

    let signature: string
    let contentUrl: string | undefined

    if (parsed.format === 'json') {
      contentUrl = parsed.feed.home_page_url
      signature = createSignature(parsed.feed, ['feed_url'])
    } else {
      const selfLink = retrieveSelfLink(parsed)
      const savedSelfHref = selfLink?.href
      if (selfLink) {
        selfLink.href = undefined
      }

      if (parsed.format === 'rss') {
        contentUrl = parsed.feed.link
        signature = createSignature(parsed.feed, ['lastBuildDate', 'pubDate', 'link', 'generator'])
      } else if (parsed.format === 'rdf') {
        contentUrl = parsed.feed.link
        signature = createSignature(parsed.feed, ['link'])
      } else {
        signature = createSignature(parsed.feed, ['updated', 'generator'])
      }

      if (selfLink) {
        selfLink.href = savedSelfHref
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
