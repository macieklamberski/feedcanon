import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type { FetchFnResponse, ParserAdapter } from './types.js'

// Helper to create a mock parser that returns a specific selfUrl.
const createMockParser = (selfUrl: string | undefined): ParserAdapter<string> => {
  return {
    parse: (body) => {
      return body
    },
    getSelfUrl: () => {
      return selfUrl
    },
    getSignature: (parsed) => {
      return { content: parsed }
    },
  }
}

// Helper to create a mock fetchFn.
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

describe('canonicalize', () => {
  describe('when initial fetch fails', () => {
    it('should return input URL when fetch throws', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: value, reason: 'fetch_failed' })
    })

    it('should return input URL when fetch returns 404', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: value, reason: 'fetch_failed' })
    })
  })

  describe('when no parser is provided', () => {
    it('should test variants and fallback to responseUrl', async () => {
      const value = 'https://www.example.com/feed/'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize(value, options)

      // Without parser, no selfUrl, so variants are generated from responseUrl.
      // First tier (no www, no trailing slash) should work.
      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })
  })

  describe('when selfUrl equals responseUrl', () => {
    it('should still test cleaner variants', async () => {
      const value = 'https://www.example.com/feed/'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://www.example.com/feed/'),
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })
  })

  describe('selfUrl validation', () => {
    it('should use selfUrl as variant source when valid', async () => {
      const value = 'https://cdn.example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize(value, options)

      // selfUrl validates (same hash), so variants are generated from selfUrl.
      // selfUrl is already clean, so it's used directly.
      expect(result.url).toBe('https://example.com/feed')
    })

    it('should use responseUrl when selfUrl has different content', async () => {
      const value = 'https://example.com/feed'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: '<feed>original</feed>' },
          'https://other.example.com/feed': { body: '<feed>different</feed>' },
        }),
        parser: createMockParser('https://other.example.com/feed'),
      }
      const result = await canonicalize(value, options)

      // selfUrl has different content, so responseUrl is used as variant source.
      expect(result.url).toBe('https://example.com/feed')
    })

    it('should use responseUrl when selfUrl fetch fails', async () => {
      const value = 'https://example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://broken.example.com/feed': { status: 500 },
        }),
        parser: createMockParser('https://broken.example.com/feed'),
      }
      const result = await canonicalize(value, options)

      expect(result.url).toBe('https://example.com/feed')
    })
  })

  describe('progressive variant testing', () => {
    it('should return first working variant (cleanest)', async () => {
      const value = 'https://www.example.com/feed/?utm_source=test'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize(value, options)

      // First tier strips www, trailing slash, and tracking params.
      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })

    it('should skip variants that fail verification', async () => {
      const value = 'https://www.example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyFn: (url: string) => {
          // Block non-www variant.
          return !url.includes('example.com/feed') || url.includes('www')
        },
      }
      const result = await canonicalize(value, options)

      // First tier (no www) fails verification, so we get fallback.
      expect(result.reason).toBe('fallback')
    })

    it('should skip variants with different content', async () => {
      const value = 'https://www.example.com/feed'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: '<feed>original</feed>' },
          'https://example.com/feed': { body: '<feed>different</feed>' },
        }),
      }
      const result = await canonicalize(value, options)

      // First tier has different content, fallback to variantSource.
      expect(result).toEqual({ url: value, reason: 'fallback' })
    })
  })

  describe('existsFn integration', () => {
    it('should return exists_in_db when existsFn finds match', async () => {
      const value = 'https://www.example.com/feed/'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
        }),
        existsFn: async (url: string) => {
          return url === 'https://example.com/feed'
        },
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'exists_in_db' })
    })

    it('should continue testing when existsFn returns false', async () => {
      const value = 'https://www.example.com/feed/'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
        existsFn: async () => {
          return false
        },
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })
  })

  describe('HTTPS upgrade', () => {
    it('should upgrade HTTP to HTTPS when content matches', async () => {
      const value = 'http://example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'upgrade_https' })
    })

    it('should skip HTTPS upgrade when content differs', async () => {
      const value = 'http://example.com/feed'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: '<feed>http</feed>' },
          'https://example.com/feed': { body: '<feed>https</feed>' },
        }),
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: value, reason: 'fallback' })
    })

    it('should skip HTTPS upgrade when fetch fails', async () => {
      const value = 'http://example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
          'https://example.com/feed': { status: 500 },
        }),
      }
      const result = await canonicalize(value, options)

      expect(result).toEqual({ url: value, reason: 'fallback' })
    })
  })

  describe('feed protocol handling', () => {
    it('should handle feed:// protocol in selfUrl', async () => {
      const value = 'https://example.com/feed'
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: content },
        }),
        parser: createMockParser('feed://example.com/feed'),
      }
      const result = await canonicalize(value, options)

      // feed:// is converted to https://, which equals responseUrl.
      expect(result.url).toBe('https://example.com/feed')
    })
  })

  describe('fallback behavior', () => {
    it('should return variantSource when no variant works', async () => {
      const value = 'https://example.com/feed'
      const options = {
        fetchFn: createMockFetch({
          [value]: { body: '<feed></feed>' },
        }),
      }
      const result = await canonicalize(value, options)

      // URL is already clean, so variantSource = responseUrl = first variant.
      expect(result).toEqual({ url: value, reason: 'fallback' })
    })
  })
})
