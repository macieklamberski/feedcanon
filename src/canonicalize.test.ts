import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import { defaultNormalizeOptions } from './defaults.js'
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
      const expected = { url: 'https://example.com/feed.xml', reason: 'fetch_failed' }

      expect(result).toEqual(expected)
    })

    it('should return input URL when fetch returns 404', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'fetch_failed' }

      expect(result).toEqual(expected)
    })
  })

  describe('when no parser is provided', () => {
    it('should return responseUrl with no_self_url reason', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'no_self_url' }

      expect(result).toEqual(expected)
    })
  })

  describe('when parser returns no selfUrl', () => {
    it('should return responseUrl when getSelfUrl returns undefined', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser(undefined),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'no_self_url' }

      expect(result).toEqual(expected)
    })

    it('should return responseUrl when parse returns undefined', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: 'not a feed',
          },
        }),
        parser: {
          parse: () => {
            return undefined
          },
          getSelfUrl: () => {
            return undefined
          },
          getSignature: () => {
            return {}
          },
        },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'no_self_url' }

      expect(result).toEqual(expected)
    })
  })

  describe('when selfUrl equals responseUrl', () => {
    it('should return responseUrl with same_url reason', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://example.com/feed.xml'),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'same_url' }

      expect(result).toEqual(expected)
    })
  })

  describe('when selfUrl is a relative URL', () => {
    it('should resolve relative selfUrl against responseUrl', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('/feed.xml'),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'same_url' }

      expect(result).toEqual(expected)
    })
  })

  describe('when selfUrl fails verification', () => {
    it('should return responseUrl when verifyFn returns false', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://malicious.com/feed'),
        verifyFn: () => {
          return false
        },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'verification_failed' }

      expect(result).toEqual(expected)
    })
  })

  describe('normalize method', () => {
    it('should return selfUrl when only protocol differs', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('http://example.com/feed.xml'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'http://example.com/feed.xml', reason: 'normalize' }

      expect(result).toEqual(expected)
    })

    it('should return selfUrl when www prefix differs', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://www.example.com/feed.xml'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://www.example.com/feed.xml', reason: 'normalize' }

      expect(result).toEqual(expected)
    })

    it('should return selfUrl when trailing slash differs', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://example.com/feed.xml/'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml/', reason: 'normalize' }

      expect(result).toEqual(expected)
    })
  })

  describe('redirects method', () => {
    it('should return responseUrl when selfUrl redirects to responseUrl', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
          'https://old.example.com/feed': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://old.example.com/feed'),
        methods: { redirects: true, responseHash: false },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'redirects' }

      expect(result).toEqual(expected)
    })
  })

  describe('responseHash method', () => {
    it('should return selfUrl when content hashes match', async () => {
      const value = 'https://example.com/feed.xml'
      const content = '<feed><item>test</item></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: content,
          },
          'https://cdn.example.com/feed.xml': {
            url: 'https://cdn.example.com/feed.xml',
            body: content,
          },
        }),
        parser: createMockParser('https://cdn.example.com/feed.xml'),
        methods: { redirects: true, responseHash: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://cdn.example.com/feed.xml', reason: 'response_hash' }

      expect(result).toEqual(expected)
    })

    it('should return responseUrl when content hashes differ', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed>original</feed>',
          },
          'https://cdn.example.com/feed.xml': {
            url: 'https://cdn.example.com/feed.xml',
            body: '<feed>different</feed>',
          },
        }),
        parser: createMockParser('https://cdn.example.com/feed.xml'),
        methods: { redirects: true, responseHash: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'different_content' }

      expect(result).toEqual(expected)
    })
  })

  describe('feedDataHash method', () => {
    it('should return selfUrl when feed signatures match', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: 'feed-content',
          },
          'https://cdn.example.com/feed.xml': {
            url: 'https://cdn.example.com/feed.xml',
            body: 'feed-content-different-whitespace',
          },
        }),
        parser: {
          parse: (body: string) => {
            return body
          },
          getSelfUrl: () => {
            return 'https://cdn.example.com/feed.xml'
          },
          getSignature: () => {
            return { title: 'Same Feed', items: ['a', 'b'] }
          },
        },
        methods: { redirects: true, responseHash: false, feedDataHash: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://cdn.example.com/feed.xml', reason: 'feed_data_hash' }

      expect(result).toEqual(expected)
    })

    it('should return responseUrl when feed signatures differ', async () => {
      const value = 'https://example.com/feed.xml'
      let callCount = 0
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: 'original-feed',
          },
          'https://cdn.example.com/feed.xml': {
            url: 'https://cdn.example.com/feed.xml',
            body: 'different-feed',
          },
        }),
        parser: {
          parse: (body: string) => {
            return body
          },
          getSelfUrl: () => {
            return 'https://cdn.example.com/feed.xml'
          },
          getSignature: (parsed: string) => {
            callCount++
            // Return different signatures for different content.
            if (parsed === 'original-feed') {
              return { title: 'Original', items: ['a'] }
            }
            return { title: 'Different', items: ['b'] }
          },
        },
        methods: { redirects: true, responseHash: false, feedDataHash: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'different_content' }

      expect(result).toEqual(expected)
    })
  })

  describe('upgradeHttps method', () => {
    it('should upgrade HTTP selfUrl to HTTPS when it works', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed>original</feed>',
          },
          'http://cdn.example.com/feed.xml': {
            url: 'http://cdn.example.com/feed.xml',
            body: '<feed>different</feed>',
          },
          'https://cdn.example.com/feed.xml': {
            url: 'https://cdn.example.com/feed.xml',
            body: '<feed>original</feed>',
          },
        }),
        parser: createMockParser('http://cdn.example.com/feed.xml'),
        methods: { redirects: false, responseHash: false, upgradeHttps: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://cdn.example.com/feed.xml', reason: 'upgrade_https' }

      expect(result).toEqual(expected)
    })

    it('should fallback when HTTPS upgrade fails', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
          'http://cdn.example.com/feed.xml': {
            url: 'http://cdn.example.com/feed.xml',
            body: '<feed></feed>',
          },
          'https://cdn.example.com/feed.xml': {
            status: 404,
          },
        }),
        parser: createMockParser('http://cdn.example.com/feed.xml'),
        methods: { redirects: false, responseHash: false, upgradeHttps: true },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'fallback' }

      expect(result).toEqual(expected)
    })
  })

  describe('feed protocol handling', () => {
    it('should handle feed:// protocol in selfUrl', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('feed://example.com/feed.xml'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      // feed:// is converted to https:// by resolveUrl, which equals responseUrl.
      const expected = { url: 'https://example.com/feed.xml', reason: 'same_url' }

      expect(result).toEqual(expected)
    })

    it('should handle feed:https:// protocol in selfUrl', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('feed:https://example.com/feed.xml'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      // feed:https:// is converted to https:// by resolveUrl, which equals responseUrl.
      const expected = { url: 'https://example.com/feed.xml', reason: 'same_url' }

      expect(result).toEqual(expected)
    })

    it('should return similar when feed:// protocol differs only by www', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('feed://www.example.com/feed.xml'),
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      // feed:// with www is converted to https://www, which differs from responseUrl by www.
      const expected = { url: 'https://www.example.com/feed.xml', reason: 'normalize' }

      expect(result).toEqual(expected)
    })
  })

  describe('invalid selfUrl schemes', () => {
    it('should return responseUrl when selfUrl is ftp://', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('ftp://example.com/feed.xml'),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'verification_failed' }

      expect(result).toEqual(expected)
    })

    it('should return responseUrl when selfUrl is javascript:', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('javascript:alert(1)'),
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'verification_failed' }

      expect(result).toEqual(expected)
    })
  })

  describe('fallback to responseUrl', () => {
    it('should return responseUrl when all methods are disabled', async () => {
      const value = 'https://example.com/feed.xml'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': {
            url: 'https://example.com/feed.xml',
            body: '<feed></feed>',
          },
        }),
        parser: createMockParser('https://different.com/feed.xml'),
        methods: { redirects: false, responseHash: false },
      }
      const result = await canonicalize(value, options)
      const expected = { url: 'https://example.com/feed.xml', reason: 'fallback' }

      expect(result).toEqual(expected)
    })
  })
})
