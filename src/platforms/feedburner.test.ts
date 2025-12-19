import { describe, expect, it } from 'bun:test'
import { normalizeUrl } from '../utils.js'
import { feedburnerHandler } from './feedburner.js'

describe('feedburnerHandler', () => {
  describe('match', () => {
    it('should match feeds.feedburner.com', () => {
      const value = new URL('https://feeds.feedburner.com/example')

      expect(feedburnerHandler.match(value)).toBe(true)
    })

    it('should match feeds2.feedburner.com', () => {
      const value = new URL('https://feeds2.feedburner.com/example')

      expect(feedburnerHandler.match(value)).toBe(true)
    })

    it('should match feedproxy.google.com', () => {
      const value = new URL('https://feedproxy.google.com/example')

      expect(feedburnerHandler.match(value)).toBe(true)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/feed')

      expect(feedburnerHandler.match(value)).toBe(false)
    })
  })

  describe('normalize', () => {
    it('should normalize feeds2 to feeds.feedburner.com', () => {
      const value = new URL('https://feeds2.feedburner.com/example')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerHandler.normalize(value).href).toBe(expected)
    })

    it('should normalize feedproxy.google.com to feeds.feedburner.com', () => {
      const value = new URL('https://feedproxy.google.com/example')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerHandler.normalize(value).href).toBe(expected)
    })

    it('should strip all query params', () => {
      const value = new URL('https://feeds.feedburner.com/example?format=rss&utm_source=test')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerHandler.normalize(value).href).toBe(expected)
    })

    it('should preserve path', () => {
      const value = new URL('https://feedproxy.google.com/~r/RockPaperShotgun/~3/ZG5fcDx64NA/')
      const expected = 'https://feeds.feedburner.com/~r/RockPaperShotgun/~3/ZG5fcDx64NA/'

      expect(feedburnerHandler.normalize(value).href).toBe(expected)
    })
  })
})

describe('normalizeUrl with FeedBurner', () => {
  it('should normalize feedproxy.google.com to feeds.feedburner.com', () => {
    const value = 'https://feedproxy.google.com/example'
    const expected = 'feeds.feedburner.com/example'

    expect(normalizeUrl(value)).toBe(expected)
  })

  it('should normalize feeds2.feedburner.com to feeds.feedburner.com', () => {
    const value = 'https://feeds2.feedburner.com/example'
    const expected = 'feeds.feedburner.com/example'

    expect(normalizeUrl(value)).toBe(expected)
  })

  it('should strip query params from FeedBurner URLs', () => {
    const value = 'https://feeds.feedburner.com/example?format=rss'
    const expected = 'feeds.feedburner.com/example'

    expect(normalizeUrl(value)).toBe(expected)
  })

  it('should treat all FeedBurner variants as equivalent', () => {
    const values = [
      'https://feeds.feedburner.com/Frandroid',
      'https://feeds2.feedburner.com/Frandroid',
      'https://feedproxy.google.com/Frandroid',
      'https://feeds.feedburner.com/Frandroid?format=rss',
      'http://feeds.feedburner.com/Frandroid',
    ]
    const normalized = values.map((value) => {
      return normalizeUrl(value)
    })

    // All should normalize to the same value.
    expect(new Set(normalized).size).toBe(1)
  })

  it('should not affect non-FeedBurner URLs', () => {
    const value = 'https://example.com/feed?id=123'
    const expected = 'example.com/feed?id=123'

    expect(normalizeUrl(value)).toBe(expected)
  })
})
