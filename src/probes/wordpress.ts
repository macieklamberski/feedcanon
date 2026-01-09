import type { Probe } from '../types.js'

const feedTypes = ['atom', 'rss2', 'rss', 'rdf']

export const wordpressProbe: Probe = {
  match: (url) => {
    const feed = url.searchParams.get('feed')?.toLowerCase()

    if (!feed) {
      return false
    }

    const isComment = feed.startsWith('comments-')
    const type = isComment ? feed.slice(9) : feed
    return feedTypes.includes(type)
  },

  getCandidates: (url) => {
    const feed = url.searchParams.get('feed')?.toLowerCase()

    if (!feed) {
      return []
    }

    const candidates: Array<string> = []
    const isComment = feed.startsWith('comments-')
    const type = isComment ? feed.slice(9) : feed

    // Path already contains feed segment - param is redundant, just strip it.
    const pathPattern = isComment ? /\/comments\/feed(\/|$)/ : /\/feed(\/|$)/
    if (pathPattern.test(url.pathname)) {
      const withoutSlash = new URL(url)
      withoutSlash.pathname = url.pathname.replace(/\/$/, '')
      withoutSlash.searchParams.delete('feed')
      candidates.push(withoutSlash.href)

      const withSlash = new URL(url)
      withSlash.pathname = url.pathname.replace(/\/?$/, '/')
      withSlash.searchParams.delete('feed')
      candidates.push(withSlash.href)

      return candidates
    }

    // Convert ?feed=X to path-based URL.
    const basePath = url.pathname.replace(/\/$/, '')
    const feedSegment = type === 'atom' ? '/feed/atom' : '/feed'
    const feedPath = isComment ? `/comments${feedSegment}` : feedSegment

    const primary = new URL(url)
    primary.pathname = basePath + feedPath
    primary.searchParams.delete('feed')
    candidates.push(primary.href)

    const withSlash = new URL(url)
    withSlash.pathname = `${basePath}${feedPath}/`
    withSlash.searchParams.delete('feed')
    candidates.push(withSlash.href)

    return candidates
  },
}
