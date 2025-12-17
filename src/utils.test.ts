import { describe, expect, it } from 'bun:test'
import { addMissingProtocol, resolveNonStandardFeedUrl } from './utils.js'

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
