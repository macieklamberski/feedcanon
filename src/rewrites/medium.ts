import { getMainFeedUrl, medium } from 'feedintel'
import { isHostOf, parseUrl } from 'trousse'
import type { Rewrite } from '../types.js'

const platforms = [medium]

export const mediumRewrite: Rewrite = {
  match: (url) => {
    return isHostOf(url, medium.hosts.exact)
  },

  rewrite: (url) => {
    // The spelling a user feed names itself, the scheme and the `www` host come from feedintel's rows.
    // A URL the rows do not rewrite, as a page or a publication under its own host, stays as given.
    return parseUrl(getMainFeedUrl(url.href, platforms)) ?? url
  },
}
