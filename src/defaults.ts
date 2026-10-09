import { parseFeed } from 'feedsmith'
import { isHttpUrl, type NormalizeOptions, parseUrl, resolveUrl } from 'trousse'
import type { DefaultParserResult, FetchFn, FetchFnRedirect, ParserAdapter, Tier } from './types.js'
import { createSignature, isRelation, neutralizeUrls } from './utils.js'

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
  'application/atom+xml, application/rss+xml, application/feed+json, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8'
const redirectStatuses = [301, 302, 303, 307, 308]
const maxRedirects = 20
const requestBodyHeaders = [
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-type',
]
const credentialHeaders = ['authorization', 'cookie', 'proxy-authorization']
const postToGetStatuses = [301, 302]

// findCanonical needs the status of every redirect, which fetch hides when it follows them, so
// redirects are followed here, by the same rules fetch applies.
// See: https://fetch.spec.whatwg.org/#http-redirect-fetch.
export const defaultFetch: FetchFn = async (url, options) => {
  const signal = AbortSignal.timeout(30_000)
  const redirects: Array<FetchFnRedirect> = []
  let requestUrl = url
  let method = options?.method ?? 'GET'
  let body = options?.body
  const headers = new Headers(options?.headers)

  if (!headers.has('accept')) {
    headers.set('accept', defaultAccept)
  }

  while (true) {
    const response = await fetch(requestUrl, {
      method,
      headers,
      body,
      signal,
      redirect: 'manual',
    })
    const location = response.headers.get('location')

    if (!redirectStatuses.includes(response.status) || !location) {
      return {
        headers: response.headers,
        body: await response.text(),
        url: response.url,
        status: response.status,
        redirects,
      }
    }

    if (redirects.length === maxRedirects) {
      throw new TypeError(`Too many redirects from ${url}`)
    }

    redirects.push({ url: requestUrl, status: response.status })
    await response.body?.cancel()
    const locationUrl = new URL(location, requestUrl)

    // A redirect is followed only to another http or https URL, never to data: or file:.
    if (!isHttpUrl(locationUrl)) {
      throw new TypeError(`Redirect to a non-HTTP URL from ${url}`)
    }

    // Credentials for one origin never reach another.
    if (locationUrl.origin !== new URL(requestUrl).origin) {
      for (const name of credentialHeaders) {
        headers.delete(name)
      }
    }

    requestUrl = locationUrl.href

    const isPostToGet = method === 'POST' && postToGetStatuses.includes(response.status)

    if ((response.status === 303 && method !== 'HEAD') || isPostToGet) {
      method = 'GET'
      body = undefined

      for (const name of requestBodyHeaders) {
        headers.delete(name)
      }
    }
  }
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
    stripScheme: false,
    stripAuthentication: false,
    stripWww: true,
    stripHostTrailingDot: true,
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: false,
    stripQuery: true,
    stripEmptyQuery: true,
    normalizeEncoding: true,
  },
  // Tier 2: Strip www and trailing slash, keep query.
  {
    stripScheme: false,
    stripAuthentication: false,
    stripWww: true,
    stripHostTrailingDot: true,
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
  },
  // Tier 3: Keep www, strip trailing slash, keep query.
  {
    stripScheme: false,
    stripAuthentication: false,
    stripWww: false,
    stripHostTrailingDot: true,
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
  },
  // Tier 4: Keep www and trailing slash, keep query.
  {
    stripScheme: false,
    stripAuthentication: false,
    stripWww: false,
    stripHostTrailingDot: true,
    stripTrailingSlash: false,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQuery: false,
    stripEmptyQuery: true,
    normalizeEncoding: true,
  },
]
