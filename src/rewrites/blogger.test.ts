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

    it('should match blogspot.com', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.in', () => {
      const value = new URL('https://example.blogspot.in/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.co.uk', () => {
      const value = new URL('https://example.blogspot.co.uk/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.com.br', () => {
      const value = new URL('https://example.blogspot.com.br/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(true)
    })

    it('should not match blogspot in path', () => {
      const value = new URL('https://example.com/blogspot.com/feed')

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

    it('should normalize .blogspot.in to .blogspot.com', () => {
      const value = new URL('https://example.blogspot.in/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize .blogspot.co.uk to .blogspot.com', () => {
      const value = new URL('https://example.blogspot.co.uk/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should rewrite /atom.xml to /feeds/posts/default', () => {
      const value = new URL('https://example.blogspot.com/atom.xml')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should rewrite /rss.xml to /feeds/posts/default?alt=rss', () => {
      const value = new URL('https://example.blogspot.com/rss.xml')
      const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize .blogspot.com.br to .blogspot.com', () => {
      const value = new URL('https://example.blogspot.com.br/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize .blogspot.de to .blogspot.com', () => {
      const value = new URL('https://example.blogspot.de/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should keep .blogspot.com unchanged', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should normalize http blogspot to https', () => {
      const value = new URL('http://example.blogspot.com/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should rewrite http atom.xml to https feeds/posts/default', () => {
      const value = new URL('http://example.blogspot.com/atom.xml')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve blogspot label feeds', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default/-/tech')
      const expected = 'https://example.blogspot.com/feeds/posts/default/-/tech'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve blogspot comment feeds', () => {
      const value = new URL('https://example.blogspot.com/feeds/comments/default')
      const expected = 'https://example.blogspot.com/feeds/comments/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should strip blogspot redirect param', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default?redirect=false')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })

    it('should preserve blogspot alt=rss while stripping pagination', () => {
      const value = new URL(
        'https://example.blogspot.com/feeds/posts/default?alt=rss&max-results=5&start-index=10',
      )
      const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

      expect(bloggerRewrite.normalize(value).href).toBe(expected)
    })
  })
})
