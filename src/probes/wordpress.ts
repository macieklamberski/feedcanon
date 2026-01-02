import type { Probe } from '../types.js'

const feedParams = ['atom', 'rss2', 'rss', 'rdf']

export const wordpressProbe: Probe = {
  match: (url) => {
    const feed = url.searchParams.get('feed')
    return !!feed && feedParams.includes(feed.toLowerCase())
  },

  getCandidates: (url) => {
    const feed = url.searchParams.get('feed')?.toLowerCase()

    if (!feed) {
      return []
    }

    const candidates: Array<URL> = []

    // Path already contains /feed segment - param is redundant, just strip it.
    if (/\/feed(\/|$)/.test(url.pathname)) {
      const withoutSlash = new URL(url)
      withoutSlash.pathname = url.pathname.replace(/\/$/, '')
      withoutSlash.searchParams.delete('feed')
      candidates.push(withoutSlash)

      const withSlash = new URL(url)
      withSlash.pathname = url.pathname.replace(/\/?$/, '/')
      withSlash.searchParams.delete('feed')
      candidates.push(withSlash)

      return candidates
    }

    // Normal case: convert ?feed=X to path-based /feed or /feed/atom.
    const basePath = url.pathname.replace(/\/$/, '')
    const feedPath = feed === 'atom' ? '/feed/atom' : '/feed'

    const primary = new URL(url)
    primary.pathname = basePath + feedPath
    primary.searchParams.delete('feed')
    candidates.push(primary)

    const withSlash = new URL(url)
    withSlash.pathname = `${basePath}${feedPath}/`
    withSlash.searchParams.delete('feed')
    candidates.push(withSlash)

    return candidates
  },
}
