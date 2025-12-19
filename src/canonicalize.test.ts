import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type { FetchFnResponse, ParserAdapter } from './types.js'

describe('canonicalize', () => {
  const createMockParser = (selfUrl: string | undefined): ParserAdapter<string> => {
    return {
      parse: (body) => body,
      getSelfUrl: () => selfUrl,
      getSignature: (parsed) => ({ content: parsed }),
    }
  }

  const createMockFetch = (responses: Record<string, Partial<FetchFnResponse>>) => {
    return async (url: string): Promise<FetchFnResponse> => {
      const response = responses[url]

      if (!response) {
        throw new Error(`No mock for ${url}`)
      }

      return {
        status: response.status ?? 200,
        url: response.url ?? url,
        body: response.body ?? '',
        headers: response.headers ?? new Headers(),
      }
    }
  }

  // Real-world cases from CANONICALIZATION-CASES.md with default settings.
  describe('canonicalization cases', () => {
    it('Case 1: should normalize FeedBurner aliases to canonical domain', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/TechCrunch?format=xml': { body: content },
          'https://feeds.feedburner.com/TechCrunch': { body: content },
        }),
      }
      const result = await canonicalize(
        'https://feedproxy.google.com/TechCrunch?format=xml',
        options,
      )

      expect(result.url).toBe('https://feeds.feedburner.com/TechCrunch')
    })

    it('Case 2: should clean polluted URL (www, trailing slash, tracking params)', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://www.example.com/feed/?utm_source=twitter&utm_medium=social': { body: content },
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize(
        'http://www.example.com/feed/?utm_source=twitter&utm_medium=social',
        options,
      )

      expect(result).toEqual({ url: 'http://example.com/feed', reason: 'content_verified' })
    })

    it('Case 3: should adopt cleaner self URL when valid', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567': { body: content },
          'https://blog.example.com/rss.xml': { body: content },
        }),
        parser: createMockParser('https://blog.example.com/rss.xml'),
      }
      const result = await canonicalize(
        'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567',
        options,
      )

      // selfUrl is already in cleanest form, so variantSource equals first variant → fallback
      expect(result).toEqual({ url: 'https://blog.example.com/rss.xml', reason: 'fallback' })
    })

    it('Case 4: should use responseUrl when self URL does not work', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://old.example.com/feed': { status: 404 },
        }),
        parser: createMockParser('https://old.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    it('Case 5: should use responseUrl when self URL produces different content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>summary</feed>' },
          'https://example.com/feed/full': { body: '<feed>full content</feed>' },
        }),
        parser: createMockParser('https://example.com/feed/full'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    it('Case 6: should follow redirects and use final destination', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://old-blog.example.com/rss': {
            body: content,
            url: 'https://blog.example.com/feed',
          },
          'https://blog.example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('http://old-blog.example.com/rss', options)

      expect(result.url).toBe('https://blog.example.com/feed')
    })

    it('Case 7: should upgrade HTTP to HTTPS when content matches', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'upgrade_https' })
    })

    it('Case 8: should keep HTTP when HTTPS fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://legacy.example.com/feed.rss': { body: content },
          'https://legacy.example.com/feed.rss': { status: 500 },
        }),
      }
      const result = await canonicalize('http://legacy.example.com/feed.rss', options)

      expect(result).toEqual({ url: 'http://legacy.example.com/feed.rss', reason: 'fallback' })
    })

    it('Case 9: should prefer non-www when both work', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      // selfUrl is already in cleanest form, so variantSource equals first variant → fallback
      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'fallback' })
    })

    it('Case 10: should handle feed:// protocol in self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/rss.xml': { body: content },
        }),
        parser: createMockParser('feed://example.com/rss.xml'),
      }
      const result = await canonicalize('https://example.com/rss.xml', options)

      expect(result.url).toBe('https://example.com/rss.xml')
    })

    it('Case 12: should resolve relative self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/blog/feed.xml': { body: content },
        }),
        parser: createMockParser('feed.xml'),
      }
      const result = await canonicalize('https://example.com/blog/feed.xml', options)

      expect(result.url).toBe('https://example.com/blog/feed.xml')
    })

    it('Case 13: should keep functional query params when stripping changes content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed?format=rss': { body: '<feed>rss format</feed>' },
          'https://example.com/feed': { body: '<feed>default format</feed>' },
        }),
      }
      const result = await canonicalize('https://example.com/feed?format=rss', options)

      expect(result.url).toBe('https://example.com/feed?format=rss')
    })

    it('Case 14: should use responseUrl when no self URL present', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    it('Case 15: should fall back to original when all variants fail', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://special.example.com:8443/api/v2/feed.json?auth=token123': { body: content },
          'https://special.example.com/api/v2/feed.json': { status: 404 },
          'https://special.example.com:8443/api/v2/feed.json': { status: 401 },
        }),
      }
      const result = await canonicalize(
        'https://special.example.com:8443/api/v2/feed.json?auth=token123',
        options,
      )

      expect(result.url).toBe('https://special.example.com:8443/api/v2/feed.json?auth=token123')
      expect(result.reason).toBe('fallback')
    })

    it('Case 21: should fall back when platform canonical is dead', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/MyBlog': { body: content },
          'https://feeds.feedburner.com/MyBlog': { status: 404 },
        }),
      }
      const result = await canonicalize('https://feedproxy.google.com/MyBlog', options)

      expect(result.url).toBe('https://feedproxy.google.com/MyBlog')
    })

    it('Case 24: should strip default port from URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com:443/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com:443/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })
  })

  describe('with existsFn option', () => {
    it('should return exists_in_db when existsFn finds match', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
        }),
        existsFn: async (url: string) => url === 'https://example.com/feed',
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'exists_in_db' })
    })

    it('should check variants in tier order', async () => {
      const content = '<feed></feed>'
      const checkedUrls: Array<string> = []
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
        }),
        existsFn: async (url: string) => {
          checkedUrls.push(url)
          return false
        },
      }
      await canonicalize('https://www.example.com/feed/', options)

      expect(checkedUrls[0]).toBe('https://example.com/feed')
    })

    it('should continue testing when existsFn returns false', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
          'https://example.com/feed': { body: content },
        }),
        existsFn: async () => false,
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })
  })

  describe('with verifyFn option', () => {
    it('should skip variants that fail verification', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyFn: (url: string) => url.includes('www'),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      expect(result.reason).toBe('fallback')
    })

    it('should skip HTTPS upgrade when verification fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyFn: (url: string) => !url.startsWith('https://'),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result.url).toBe('http://example.com/feed')
    })
  })

  describe('with parser option', () => {
    it('should use selfUrl as variant source when valid', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://cdn.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://cdn.example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    it('should ignore selfUrl when content differs', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>original</feed>' },
          'https://other.example.com/feed': { body: '<feed>different</feed>' },
        }),
        parser: createMockParser('https://other.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    it('should ignore selfUrl when fetch fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://broken.example.com/feed': { status: 500 },
        }),
        parser: createMockParser('https://broken.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })
  })

  describe('when fetch fails', () => {
    it('should return input URL when fetch throws', async () => {
      const options = {
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toEqual({ url: 'https://example.com/feed.xml', reason: 'fetch_failed' })
    })

    it('should return input URL when fetch returns non-2xx', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toEqual({ url: 'https://example.com/feed.xml', reason: 'fetch_failed' })
    })
  })
})
