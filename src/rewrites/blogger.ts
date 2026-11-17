import { blogger, blogspot, getMainFeedUrl, getMainSiteUrl } from 'feedintel'
import { isHostOf, isSubdomainOf, normalizeUrl, parseUrl } from 'trousse'
import type { Rewrite } from '../types.js'

const platforms = [blogger, blogspot]

const redundantAltValues = ['atom', 'json', '']

const cleanUrl = (url: URL): URL => {
  // biome-ignore lint/plugin/noBareNewUrl: Copies a parsed url, so this cannot throw.
  const cleaned = new URL(url)

  // Strip v (GData API version, now ignored). The other API params stay: without
  // `redirect=false` a blog with FeedBurner set up redirects its feed there, which can carry
  // different content, and pagination, date filters and `orderby` select other posts.
  cleaned.searchParams.delete('v')

  // Strip alt=atom and alt=json (Atom is the default, JSON is same content).
  const altValues = cleaned.searchParams.getAll('alt')
  cleaned.searchParams.delete('alt')

  for (const alt of altValues) {
    if (!redundantAltValues.includes(alt)) {
      cleaned.searchParams.append('alt', alt)
    }
  }

  const normalized = normalizeUrl(cleaned.href, {
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
    stripEmptyQuery: true,
    sortQueryParams: true,
  })

  return parseUrl(normalized) ?? url
}

export const bloggerRewrite: Rewrite = {
  match: (url) => {
    return isHostOf(url, blogger.hosts.exact) || isSubdomainOf(url, blogspot.hosts.tenants)
  },

  rewrite: (url) => {
    const cleanedUrl = cleanUrl(url)
    // The legacy paths of a feed and the host and scheme of any page come from feedintel's rows.
    const mainUrl = parseUrl(
      getMainFeedUrl(cleanedUrl.href, platforms) ?? getMainSiteUrl(cleanedUrl.href, platforms),
    )

    if (!mainUrl) {
      return cleanedUrl
    }

    return cleanUrl(mainUrl)
  },
}
