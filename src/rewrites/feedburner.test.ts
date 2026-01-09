import { describe, expect, it } from 'bun:test'
import { feedburnerRewrite } from './feedburner.js'

describe('feedburnerRewrite', () => {
  describe('match', () => {
    it('should match feeds.feedburner.com', () => {
      const value = new URL('https://feeds.feedburner.com/example')

      expect(feedburnerRewrite.match(value)).toBe(true)
    })

    it('should match feeds2.feedburner.com', () => {
      const value = new URL('https://feeds2.feedburner.com/example')

      expect(feedburnerRewrite.match(value)).toBe(true)
    })

    it('should match feedproxy.google.com', () => {
      const value = new URL('https://feedproxy.google.com/example')

      expect(feedburnerRewrite.match(value)).toBe(true)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/feed')

      expect(feedburnerRewrite.match(value)).toBe(false)
    })
  })

  describe('rewrite', () => {
    it('should normalize feeds2 to feeds.feedburner.com', () => {
      const value = new URL('https://feeds2.feedburner.com/example')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize feedproxy.google.com to feeds.feedburner.com', () => {
      const value = new URL('https://feedproxy.google.com/example')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip all query params', () => {
      const value = new URL('https://feeds.feedburner.com/example?format=rss&utm_source=test')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should preserve path', () => {
      const value = new URL('https://feedproxy.google.com/~r/RockPaperShotgun/~3/ZG5fcDx64NA/')
      const expected = 'https://feeds.feedburner.com/~r/RockPaperShotgun/~3/ZG5fcDx64NA'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })
  })

  describe('normalization', () => {
    it('should strip trailing slash', () => {
      const value = new URL('https://feeds.feedburner.com/example/')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should collapse multiple slashes', () => {
      const value = new URL('https://feeds.feedburner.com//example///feed')
      const expected = 'https://feeds.feedburner.com/example/feed'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip hash fragment', () => {
      const value = new URL('https://feeds.feedburner.com/example#section')
      const expected = 'https://feeds.feedburner.com/example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize percent encoding', () => {
      const value = new URL('https://feeds.feedburner.com/%7Eexample')
      const expected = 'https://feeds.feedburner.com/~example'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize unicode', () => {
      const value = new URL('https://feeds.feedburner.com/caf\u00e9')
      const expected = 'https://feeds.feedburner.com/caf%C3%A9'

      expect(feedburnerRewrite.rewrite(value).href).toBe(expected)
    })
  })
})
