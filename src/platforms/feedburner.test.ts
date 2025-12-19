import { describe, expect, it } from 'bun:test'
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
