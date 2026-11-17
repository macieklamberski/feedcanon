import { feedburner, getMainFeedUrl } from 'feedintel'
import { isHostOf, normalizeUrl, parseUrl } from 'trousse'
import type { Rewrite } from '../types.js'

const platforms = [feedburner]

const cleanUrl = (url: URL): URL => {
  // biome-ignore lint/plugin/noBareNewUrl: Copies a parsed url, so this cannot throw.
  const cleaned = new URL(url)

  // Strip all query params (FeedBurner uses them for tracking only).
  cleaned.search = ''

  const normalized = normalizeUrl(cleaned.href, {
    stripTrailingSlash: true,
    collapseSlashes: true,
    stripHash: true,
    normalizeEncoding: true,
    normalizeUnicode: true,
  })

  return parseUrl(normalized) ?? url
}

export const feedburnerRewrite: Rewrite = {
  match: (url) => {
    return isHostOf(url, feedburner.hosts.exact)
  },

  rewrite: (url) => {
    const cleanedUrl = cleanUrl(url)
    // The older hosts of a feed come from feedintel's rows.
    const mainUrl = parseUrl(getMainFeedUrl(cleanedUrl.href, platforms))

    if (!mainUrl) {
      return cleanedUrl
    }

    return cleanUrl(mainUrl)
  },
}
