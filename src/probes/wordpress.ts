import type { Probe } from '../types.js'

const commentsFeedPathRegex = /\/comments\/feed(\/|$)/
const feedPathRegex = /\/feed(\/|$)/
const trailingSlashRegex = /\/$/
const optionalTrailingSlashRegex = /\/?$/

const feedTypes = ['atom', 'rss2', 'rss', 'rdf']

// WordPress serves the same feed at ?feed=rss2 and under /feed/, so the query form is an alias.
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

    const pathRegex = isComment ? commentsFeedPathRegex : feedPathRegex
    if (pathRegex.test(url.pathname)) {
      const withoutSlash = new URL(url)
      withoutSlash.pathname = url.pathname.replace(trailingSlashRegex, '')
      withoutSlash.searchParams.delete('feed')
      candidates.push(withoutSlash.href)

      const withSlash = new URL(url)
      withSlash.pathname = url.pathname.replace(optionalTrailingSlashRegex, '/')
      withSlash.searchParams.delete('feed')
      candidates.push(withSlash.href)

      return candidates
    }

    const basePath = url.pathname.replace(trailingSlashRegex, '')
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
