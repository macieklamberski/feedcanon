import { blogger, blogspot, getMainFeedUrl, getMainSiteUrl } from 'feedintel'
import { isHostOf, isSubdomainOf, normalizeUrl, parseUrl } from 'trousse'
import type { Rewrite } from '../types.js'

const platforms = [blogger, blogspot]

const cleanUrl = (url: URL): URL => {
  const normalized = normalizeUrl(url.href, {
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
    // The feeds, their legacy paths and their parameters come from feedintel's rows, as do the
    // host and scheme of any page. A URL is tried as given first, then cleaned, since a row can
    // write what cleaning removes.
    const mainUrl = parseUrl(
      getMainFeedUrl(url.href, platforms) ??
        getMainFeedUrl(cleanedUrl.href, platforms) ??
        getMainSiteUrl(cleanedUrl.href, platforms),
    )

    if (!mainUrl) {
      return cleanedUrl
    }

    return cleanUrl(mainUrl)
  },
}
