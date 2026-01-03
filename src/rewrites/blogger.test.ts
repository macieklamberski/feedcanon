import { describe, expect, it } from 'bun:test'
import { bloggerRewrite } from './blogger.js'

describe('bloggerRewrite', () => {
  describe('match', () => {
    it('should match blogger.com', () => {
      const value = new URL('https://blogger.com/feeds/123/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should match www.blogger.com', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should match beta.blogger.com', () => {
      const value = new URL('https://beta.blogger.com/feeds/123/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/feed')

      expect(bloggerRewrite.match(value)).toBe(false)
    })

    it('should not match blogspot.com', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(false)
    })
  })

  describe('normalize', () => {
    it('should normalize http to https', () => {
      const value = new URL('http://www.blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize non-www to www', () => {
      const value = new URL('https://blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize beta to www', () => {
      const value = new URL('https://beta.blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip redirect param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?redirect=false')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip alt=atom param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?alt=atom')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip alt=json param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?alt=json')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip empty alt param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?alt=')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip v param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?v=2')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve alt=rss param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?alt=rss')
      const expected = 'https://www.blogger.com/feeds/123/posts/default?alt=rss'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip orderby param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?orderby=updated')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip max-results param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?max-results=5')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip start-index param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?start-index=10')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip date filter params', () => {
      const value = new URL(
        'https://www.blogger.com/feeds/123/posts/default?published-min=2024-01-01&published-max=2024-12-31&updated-min=2024-01-01&updated-max=2024-12-31',
      )
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve functional params like alt', () => {
      const value = new URL(
        'https://www.blogger.com/feeds/123/posts/default?alt=rss&max-results=5&redirect=false',
      )
      const expected = 'https://www.blogger.com/feeds/123/posts/default?alt=rss'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve path', () => {
      const value = new URL('http://blogger.com/feeds/123456789/posts/default')
      const expected = 'https://www.blogger.com/feeds/123456789/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve label feeds', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default/-/tech')
      const expected = 'https://www.blogger.com/feeds/123/posts/default/-/tech'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve comment feeds', () => {
      const value = new URL('https://www.blogger.com/feeds/123/comments/default')
      const expected = 'https://www.blogger.com/feeds/123/comments/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve post-specific comment feeds', () => {
      const value = new URL('https://www.blogger.com/feeds/123/456/comments/default')
      const expected = 'https://www.blogger.com/feeds/123/456/comments/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })
  })
})
