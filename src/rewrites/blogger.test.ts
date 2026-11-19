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

    it('should not match bare blogspot.com', () => {
      const value = new URL('https://blogspot.com/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(false)
    })

    it('should not match blogspot subdomain of unrelated domain', () => {
      const value = new URL('https://example.blogspot.xyz.de/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(false)
    })

    it('should not match blogspot under generic TLD', () => {
      const value = new URL('https://example.blogspot.xyz/feeds/posts/default')

      expect(bloggerRewrite.match(value)).toBe(false)
    })
  })

  describe('rewrite', () => {
    it('should normalize http to https', () => {
      const value = new URL('http://www.blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize non-www to www', () => {
      const value = new URL('https://blogger.com/feeds/123/posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip alt=atom param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?alt=atom')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip v param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?v=2')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip www from a blogspot host', () => {
      const value = new URL('https://www.example.blogspot.com/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize .blogspot.co.uk to .blogspot.com', () => {
      const value = new URL('https://example.blogspot.co.uk/feeds/posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should rewrite /atom.xml to /feeds/posts/default', () => {
      const value = new URL('https://example.blogspot.com/atom.xml')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should rewrite /rss.xml to /feeds/posts/default?alt=rss', () => {
      const value = new URL('https://example.blogspot.com/rss.xml')
      const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should keep the category param', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?category=tech')
      const expected = 'https://www.blogger.com/feeds/123/posts/default?category=tech'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should drop a param Blogger does not define', () => {
      const value = new URL(
        'https://example.blogspot.com/feeds/posts/default?utm_source=newsletter',
      )
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize the host and scheme of a page that is no feed', () => {
      const value = new URL('http://example.blogspot.de/2020/01/post.html')
      const expected = 'https://example.blogspot.com/2020/01/post.html'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should sort the query of a page that is no feed', () => {
      const value = new URL(
        'https://example.blogspot.com/search?updated-max=2024-01-01&max-results=5',
      )
      const expected = 'https://example.blogspot.com/search?max-results=5&updated-max=2024-01-01'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should rewrite /atom.xml with a trailing slash', () => {
      const value = new URL('https://example.blogspot.com/atom.xml/')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize percent encoding in a rewritten feed', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default/-/%7Etag?alt=atom')
      const expected = 'https://example.blogspot.com/feeds/posts/default/-/~tag'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })
  })

  describe('normalization', () => {
    it('should strip trailing slash', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default/')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should collapse multiple slashes', () => {
      const value = new URL('https://www.blogger.com//feeds//123//posts/default')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip hash fragment', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default#section')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip empty query string', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default?')
      const expected = 'https://www.blogger.com/feeds/123/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize percent encoding', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default/-/%7Etag')
      const expected = 'https://www.blogger.com/feeds/123/posts/default/-/~tag'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize unicode', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default/-/caf\u00e9')
      const expected = 'https://www.blogger.com/feeds/123/posts/default/-/caf%C3%A9'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should sort query params', () => {
      const value = new URL(
        'https://www.blogger.com/feeds/123/posts/default?start-index=1&max-results=2',
      )
      const expected = 'https://www.blogger.com/feeds/123/posts/default?max-results=2&start-index=1'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip trailing slash on blogspot', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default/')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should collapse multiple slashes on blogspot', () => {
      const value = new URL('https://example.blogspot.com//feeds//posts/default')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip hash fragment on blogspot', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default#section')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should strip empty query string on blogspot', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default?')
      const expected = 'https://example.blogspot.com/feeds/posts/default'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize percent encoding on blogspot', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default/-/%7Etag')
      const expected = 'https://example.blogspot.com/feeds/posts/default/-/~tag'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should normalize unicode on blogspot', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default/-/caf\u00e9')
      const expected = 'https://example.blogspot.com/feeds/posts/default/-/caf%C3%A9'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })

    it('should sort query params on blogspot', () => {
      const value = new URL(
        'https://example.blogspot.com/feeds/posts/default?start-index=1&alt=rss&max-results=2',
      )
      const expected =
        'https://example.blogspot.com/feeds/posts/default?alt=rss&max-results=2&start-index=1'

      expect(bloggerRewrite.rewrite(value).href).toBe(expected)
    })
  })
})
