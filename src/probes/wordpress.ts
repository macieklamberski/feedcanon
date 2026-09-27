import type { Probe } from '../types.js'

type FeedParam = {
  isComment: boolean
  type: string
}

const commentsFeedPathRegex = /\/comments\/feed(\/|$)/
const feedPathRegex = /\/feed(\/|$)/
const trailingSlashRegex = /\/$/
const optionalTrailingSlashRegex = /\/?$/

const feedTypes = ['atom', 'rss2', 'rss', 'rdf']

const parseFeedParam = (url: URL): FeedParam | undefined => {
  const feed = url.searchParams.get('feed')?.toLowerCase()

  if (!feed) {
    return
  }

  const isComment = feed.startsWith('comments-')

  return {
    isComment,
    type: isComment ? feed.slice(9) : feed,
  }
}

const createCandidate = (url: URL, pathname: string): string => {
  const candidate = new URL(url)
  candidate.pathname = pathname
  candidate.searchParams.delete('feed')

  return candidate.href
}

export const wordpressProbe: Probe = {
  match: (url) => {
    const feedParam = parseFeedParam(url)

    if (!feedParam) {
      return false
    }

    return feedTypes.includes(feedParam.type)
  },

  getCandidates: (url) => {
    const feedParam = parseFeedParam(url)

    if (!feedParam) {
      return []
    }

    // Path already contains feed segment - param is redundant, just strip it.
    const pathRegex = feedParam.isComment ? commentsFeedPathRegex : feedPathRegex
    if (pathRegex.test(url.pathname)) {
      return [
        createCandidate(url, url.pathname.replace(trailingSlashRegex, '')),
        createCandidate(url, url.pathname.replace(optionalTrailingSlashRegex, '/')),
      ]
    }

    // Convert ?feed=X to path-based URL.
    const basePath = url.pathname.replace(trailingSlashRegex, '')
    // WordPress serves RSS2 at /feed and every other type at /feed/<type>.
    const feedSegment = feedParam.type === 'rss2' ? '/feed' : `/feed/${feedParam.type}`
    const feedPath = feedParam.isComment ? `/comments${feedSegment}` : feedSegment

    return [
      createCandidate(url, basePath + feedPath),
      createCandidate(url, `${basePath}${feedPath}/`),
    ]
  },
}
