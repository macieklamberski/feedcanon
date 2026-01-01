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
    const basePath = url.pathname.replace(/\/$/, '')

    // ?feed=atom -> /feed/atom, others -> /feed.
    const feedPath = feed === 'atom' ? '/feed/atom' : '/feed'
    const primary = new URL(url)
    primary.pathname = basePath + feedPath
    primary.searchParams.delete('feed')
    candidates.push(primary)

    // Also try with trailing slash.
    const withSlash = new URL(url)
    withSlash.pathname = `${basePath}${feedPath}/`
    withSlash.searchParams.delete('feed')
    candidates.push(withSlash)

    return candidates
  },
}
