import { feedburner, getMainFeedUrl } from 'feedintel'
import { isHostOf, normalizeUrl, parseUrl } from 'trousse'
import type { Rewrite } from '../types.js'

const platforms = [feedburner]

const cleanUrl = (url: URL): URL => {
  const normalized = normalizeUrl(url.href, {
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
    stripEmptyQuery: true,
  })

  return parseUrl(normalized) ?? url
}

export const feedburnerRewrite: Rewrite = {
  match: (url) => {
    return isHostOf(url, feedburner.hosts.exact)
  },

  rewrite: (url) => {
    const cleanedUrl = cleanUrl(url)
    // The older hosts of a feed and the parameters it drops come from feedintel's rows. A URL is
    // tried as given first, then cleaned, since a row can write what cleaning removes.
    const mainUrl = parseUrl(
      getMainFeedUrl(url.href, platforms) ?? getMainFeedUrl(cleanedUrl.href, platforms),
    )

    if (!mainUrl) {
      return cleanedUrl
    }

    return cleanUrl(mainUrl)
  },
}
