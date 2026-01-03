import { describe, expect, it } from 'bun:test'
import { blogspotRewrite } from './blogspot.js'

describe('blogspotRewrite', () => {
  describe('match', () => {
    it('should match *.blogspot.com', () => {
      const value = new URL('https://example.blogspot.com/feeds/posts/default')

      expect(blogspotRewrite.match(value)).toBe(true)
    })

    it('should match subdomain.blogspot.com', () => {
      const value = new URL('https://my-blog.blogspot.com/atom.xml')

      expect(blogspotRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.in', () => {
      const value = new URL('https://example.blogspot.in/feeds/posts/default')

      expect(blogspotRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.co.uk', () => {
      const value = new URL('https://example.blogspot.co.uk/feeds/posts/default')

      expect(blogspotRewrite.match(value)).toBe(true)
    })

    it('should match country TLD .blogspot.com.br', () => {
      const value = new URL('https://example.blogspot.com.br/feeds/posts/default')

      expect(blogspotRewrite.match(value)).toBe(true)
    })

    it('should not match blogger.com', () => {
      const value = new URL('https://www.blogger.com/feeds/123/posts/default')

      expect(blogspotRewrite.match(value)).toBe(false)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/feed')

      expect(blogspotRewrite.match(value)).toBe(false)
    })

    it('should not match blogspot in path', () => {
      const value = new URL('https://example.com/blogspot.com/feed')

      expect(blogspotRewrite.match(value)).toBe(false)
    })
  })

  describe('normalize', () => {
    describe('protocol normalization', () => {
      it('should normalize http to https', () => {
        const value = new URL('http://example.blogspot.com/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })
    })

    describe('country TLD normalization', () => {
      it('should normalize .blogspot.in to .blogspot.com', () => {
        const value = new URL('https://example.blogspot.in/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should normalize .blogspot.co.uk to .blogspot.com', () => {
        const value = new URL('https://example.blogspot.co.uk/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should normalize .blogspot.com.br to .blogspot.com', () => {
        const value = new URL('https://example.blogspot.com.br/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should normalize .blogspot.de to .blogspot.com', () => {
        const value = new URL('https://example.blogspot.de/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should keep .blogspot.com unchanged', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })
    })

    describe('legacy URL rewriting', () => {
      it('should rewrite /atom.xml to /feeds/posts/default', () => {
        const value = new URL('https://example.blogspot.com/atom.xml')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should rewrite /rss.xml to /feeds/posts/default?alt=rss', () => {
        const value = new URL('https://example.blogspot.com/rss.xml')
        const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should rewrite http atom.xml to https feeds/posts/default', () => {
        const value = new URL('http://example.blogspot.com/atom.xml')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should rewrite http rss.xml to https feeds/posts/default?alt=rss', () => {
        const value = new URL('http://example.blogspot.com/rss.xml')
        const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should not rewrite /feeds/posts/default', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should preserve alt=rss on /feeds/posts/default', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?alt=rss')
        const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })
    })

    describe('param stripping', () => {
      it('should strip redirect param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?redirect=false')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should strip alt=atom param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?alt=atom')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should preserve alt=rss param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?alt=rss')
        const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should strip orderby param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?orderby=published')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should strip max-results param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?max-results=5')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should strip start-index param', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default?start-index=10')
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should strip date filter params', () => {
        const value = new URL(
          'https://example.blogspot.com/feeds/posts/default?published-min=2024-01-01&published-max=2024-12-31&updated-min=2024-01-01&updated-max=2024-12-31',
        )
        const expected = 'https://example.blogspot.com/feeds/posts/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should preserve alt param while stripping pagination', () => {
        const value = new URL(
          'https://example.blogspot.com/feeds/posts/default?alt=rss&max-results=5&start-index=10',
        )
        const expected = 'https://example.blogspot.com/feeds/posts/default?alt=rss'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })
    })

    describe('path preservation', () => {
      it('should preserve label feeds', () => {
        const value = new URL('https://example.blogspot.com/feeds/posts/default/-/tech')
        const expected = 'https://example.blogspot.com/feeds/posts/default/-/tech'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should preserve comment feeds', () => {
        const value = new URL('https://example.blogspot.com/feeds/comments/default')
        const expected = 'https://example.blogspot.com/feeds/comments/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })

      it('should preserve post-specific comment feeds', () => {
        const value = new URL('https://example.blogspot.com/feeds/123456789/comments/default')
        const expected = 'https://example.blogspot.com/feeds/123456789/comments/default'

        expect(blogspotRewrite.normalize(value).href).toBe(expected)
      })
    })
  })
})
