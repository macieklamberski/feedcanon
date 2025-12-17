import { describe, expect, it } from 'bun:test'
import { addMissingProtocol, normalizeUrl, resolveNonStandardFeedUrl, resolveUrl } from './utils.js'

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

describe('addMissingProtocol', () => {
  it('adds https:// to protocol-relative URLs', () => {
    expect(addMissingProtocol('//example.com/feed')).toBe('https://example.com/feed')
  })

  it('adds https:// to bare domains', () => {
    expect(addMissingProtocol('example.com/feed')).toBe('https://example.com/feed')
  })

  it('preserves existing https:// protocol', () => {
    expect(addMissingProtocol('https://example.com/feed')).toBe('https://example.com/feed')
  })

  it('preserves existing http:// protocol', () => {
    expect(addMissingProtocol('http://example.com/feed')).toBe('http://example.com/feed')
  })

  it('does not modify relative paths', () => {
    expect(addMissingProtocol('/path/to/feed')).toBe('/path/to/feed')
  })

  it('does not modify dot-relative paths', () => {
    expect(addMissingProtocol('./path/to/feed')).toBe('./path/to/feed')
  })

  it('handles localhost', () => {
    expect(addMissingProtocol('localhost/feed')).toBe('https://localhost/feed')
  })

  it('handles localhost with port', () => {
    expect(addMissingProtocol('localhost:3000/feed')).toBe('https://localhost:3000/feed')
  })

  it('can add http:// instead of https://', () => {
    expect(addMissingProtocol('example.com/feed', 'http')).toBe('http://example.com/feed')
  })
})

describe('resolveUrl', () => {
  it('resolves absolute URLs', () => {
    expect(resolveUrl('https://example.com/feed.xml')).toBe('https://example.com/feed.xml')
  })

  it('resolves feed:// URLs', () => {
    expect(resolveUrl('feed://example.com/feed.xml')).toBe('https://example.com/feed.xml')
  })

  it('resolves relative URLs with base', () => {
    expect(resolveUrl('/feed.xml', 'https://example.com/page')).toBe(
      'https://example.com/feed.xml',
    )
  })

  it('resolves bare domains', () => {
    expect(resolveUrl('example.com/feed.xml')).toBe('https://example.com/feed.xml')
  })

  it('returns undefined for invalid URLs', () => {
    expect(resolveUrl('not a url at all')).toBeUndefined()
  })

  it('returns undefined for non-HTTP protocols', () => {
    expect(resolveUrl('ftp://example.com/feed.xml')).toBeUndefined()
  })

  it('returns undefined for javascript: URLs', () => {
    expect(resolveUrl('javascript:alert(1)')).toBeUndefined()
  })
})

describe('normalizeUrl', () => {
  it('strips protocol by default', () => {
    expect(normalizeUrl('https://example.com/feed')).toBe('example.com/feed')
    expect(normalizeUrl('http://example.com/feed')).toBe('example.com/feed')
  })

  it('strips www by default', () => {
    expect(normalizeUrl('https://www.example.com/feed')).toBe('example.com/feed')
  })

  it('strips trailing slash by default', () => {
    expect(normalizeUrl('https://example.com/feed/')).toBe('example.com/feed')
  })

  it('strips hash by default', () => {
    expect(normalizeUrl('https://example.com/feed#section')).toBe('example.com/feed')
  })

  it('sorts query parameters by default', () => {
    expect(normalizeUrl('https://example.com/feed?z=1&a=2')).toBe('example.com/feed?a=2&z=1')
  })

  it('strips default ports', () => {
    expect(normalizeUrl('https://example.com:443/feed')).toBe('example.com/feed')
    expect(normalizeUrl('http://example.com:80/feed')).toBe('example.com/feed')
  })

  it('preserves non-default ports', () => {
    expect(normalizeUrl('https://example.com:8080/feed')).toBe('example.com:8080/feed')
  })

  it('strips authentication by default', () => {
    expect(normalizeUrl('https://user:pass@example.com/feed')).toBe('example.com/feed')
  })

  it('collapses multiple slashes', () => {
    expect(normalizeUrl('https://example.com//foo///bar/feed')).toBe('example.com/foo/bar/feed')
  })

  it('lowercases hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Feed')).toBe('example.com/Feed')
  })
})
