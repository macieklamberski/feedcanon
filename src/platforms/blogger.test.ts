import { describe, expect, it } from 'bun:test'
import { bloggerHandler } from './blogger.js'

describe('bloggerHandler', () => {
  describe('match', () => {
    it('should match blogger.com', () => {
      const value = new URL('https://blogger.com/feeds/123/posts/default')

      expect(bloggerHandler.match(value)).toBe(true)
    })

    it('should match www.blogger.com', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default')

      expect(bloggerHandler.match(value)).toBe(true)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/feed')

      expect(bloggerHandler.match(value)).toBe(false)
    })

    it('should not match blogspot.com', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default')

      expect(bloggerHandler.match(value)).toBe(false)
    })
  })

  describe('normalize', () => {
    it('should normalize http to https', () => {
      const value = new URL('http://www.blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerHandler.normalize(value).href).toBe(expected)
    })

    it('should normalize non-www to www', () => {
      const value = new URL('https://blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerHandler.normalize(value).href).toBe(expected)
    })

    it('should strip redirect param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?redirect=false')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerHandler.normalize(value).href).toBe(expected)
    })

    it('should preserve other query params', () => {
      const value = new URL(
        'https://www.blogger.com/feeds/123/posts/default?alt=rss&redirect=false',
      )
      const expected = 'https://www.blogger.com/feeds/123/posts/default?alt=rss'

      expect(bloggerHandler.normalize(value).href).toBe(expected)
    })

    it('should preserve path', () => {
      const value = new URL('http://blogger.com/feeds/123456789/posts/default')
      const expected = 'https://www.blogger.com/feeds/123456789/posts/default'

      expect(bloggerHandler.normalize(value).href).toBe(expected)
    })
  })
})
