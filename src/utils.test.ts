import { describe, expect, it } from 'bun:test'
import { resolveNonStandardFeedUrl } from './utils.js'

describe('resolveNonStandardFeedUrl', () => {
  it('converts feed:// to https://', () => {
    expect(resolveNonStandardFeedUrl('feed://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
  })

  it('unwraps feed:https://', () => {
    expect(resolveNonStandardFeedUrl('feed:https://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
  })

  it('unwraps feed:http://', () => {
    expect(resolveNonStandardFeedUrl('feed:http://example.com/rss.xml')).toBe(
      'http://example.com/rss.xml',
    )
  })

  it('converts rss:// to https://', () => {
    expect(resolveNonStandardFeedUrl('rss://example.com/feed.xml')).toBe(
      'https://example.com/feed.xml',
    )
  })

  it('converts pcast:// to https://', () => {
    expect(resolveNonStandardFeedUrl('pcast://example.com/podcast.xml')).toBe(
      'https://example.com/podcast.xml',
    )
  })

  it('converts itpc:// to https://', () => {
    expect(resolveNonStandardFeedUrl('itpc://example.com/podcast.xml')).toBe(
      'https://example.com/podcast.xml',
    )
  })

  it('preserves standard https:// URLs', () => {
    expect(resolveNonStandardFeedUrl('https://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
  })

  it('preserves standard http:// URLs', () => {
    expect(resolveNonStandardFeedUrl('http://example.com/rss.xml')).toBe(
      'http://example.com/rss.xml',
    )
  })

  it('handles uppercase protocols', () => {
    expect(resolveNonStandardFeedUrl('FEED://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
  })
})
