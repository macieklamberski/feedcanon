import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultFetch, defaultParser } from './defaults.js'
import type { FetchFnResponse } from './types.js'

describe('defaultFetch', () => {
  // biome-ignore lint/suspicious/noExplicitAny: Mock helper needs flexible signature.
  const createFetchMock = <T extends (...args: Array<any>) => Promise<Response>>(
    implementation: T,
  ) => {
    return implementation as unknown as typeof fetch
  }

  type MockResponse = Pick<Response, 'headers' | 'text' | 'url' | 'status'>

  const createMockResponse = (partial: Partial<MockResponse>): Response => {
    return {
      headers: partial.headers ?? new Headers(),
      text: partial.text ?? (async () => ''),
      url: partial.url ?? '',
      status: partial.status ?? 200,
    } as Response
  }

  const fetchSpy = spyOn(globalThis, 'fetch')

  afterEach(() => {
    fetchSpy.mockReset()
  })

  it('should call native fetch with correct URL', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(async (url: string) => {
        return createMockResponse({
          url,
          text: async () => 'response body',
        })
      }),
    )
    const result = await defaultFetch('https://example.com/feed.xml')

    expect(result.url).toBe('https://example.com/feed.xml')
  })

  it('should default to GET method when not specified', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock(async (_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml')

    expect(capturedOptions?.method).toBe('GET')
  })

  it('should use specified method from options', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock(async (_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml', { method: 'HEAD' })

    expect(capturedOptions?.method).toBe('HEAD')
  })

  it('should pass headers to fetch', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock(async (_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml', {
      headers: { 'X-Custom': 'value' },
    })

    expect(capturedOptions?.headers).toEqual({ 'X-Custom': 'value' })
  })

  it('should return response with correct structure', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(async () => {
        return createMockResponse({
          headers: new Headers({ 'content-type': 'application/rss+xml' }),
          text: async () => 'feed content',
          url: 'https://example.com/feed.xml',
          status: 200,
        })
      }),
    )
    const result = await defaultFetch('https://example.com/feed.xml')
    const expected: FetchFnResponse = {
      headers: new Headers({ 'content-type': 'application/rss+xml' }),
      body: 'feed content',
      url: 'https://example.com/feed.xml',
      status: 200,
    }

    expect(result.headers.get('content-type')).toBe(expected.headers.get('content-type'))
    expect(result.body).toBe(expected.body)
    expect(result.url).toBe(expected.url)
    expect(result.status).toBe(expected.status)
  })

  it('should preserve response URL for redirect handling', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(async () => {
        return createMockResponse({
          url: 'https://redirect.example.com/feed.xml',
        })
      }),
    )
    const result = await defaultFetch('https://example.com/feed.xml')

    expect(result.url).toBe('https://redirect.example.com/feed.xml')
  })

  it('should convert response body to text', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(async () => {
        return createMockResponse({
          text: async () => '<rss>feed content</rss>',
        })
      }),
    )
    const result = await defaultFetch('https://example.com/feed.xml')

    expect(result.body).toBe('<rss>feed content</rss>')
  })

  it('should pass through status', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(async () => {
        return createMockResponse({
          status: 404,
        })
      }),
    )
    const result = await defaultFetch('https://example.com/feed.xml')

    expect(result.status).toBe(404)
  })
})

describe('defaultParser', () => {
  describe('parse', () => {
    it('should return undefined for invalid feed content', () => {
      const value = 'not a valid feed'

      expect(defaultParser.parse(value)).toBeUndefined()
    })
  })

  describe('getSelfUrl', () => {
    it('should extract self URL from Atom feed', () => {
      const value = {
        format: 'atom' as const,
        feed: {
          links: [{ rel: 'self', href: 'https://example.com/atom.xml' }],
        },
      }

      expect(defaultParser.getSelfUrl(value)).toBe('https://example.com/atom.xml')
    })

    it('should extract self URL from RSS feed', () => {
      const value = {
        format: 'rss' as const,
        feed: {
          atom: {
            links: [{ rel: 'self', href: 'https://example.com/rss.xml' }],
          },
        },
      }

      expect(defaultParser.getSelfUrl(value)).toBe('https://example.com/rss.xml')
    })

    it('should extract self URL from RDF feed', () => {
      const value = {
        format: 'rdf' as const,
        feed: {
          atom: {
            links: [{ rel: 'self', href: 'https://example.com/rdf.xml' }],
          },
        },
      }

      expect(defaultParser.getSelfUrl(value)).toBe('https://example.com/rdf.xml')
    })

    it('should extract self URL from JSON feed', () => {
      const value = {
        format: 'json' as const,
        feed: {
          feed_url: 'https://example.com/feed.json',
        },
      }

      expect(defaultParser.getSelfUrl(value)).toBe('https://example.com/feed.json')
    })
  })

  describe('getSignature', () => {
    it('should return feed object as signature', () => {
      const feed = { title: 'Test Feed', items: [] }
      const value = { format: 'rss' as const, feed }

      expect(defaultParser.getSignature(value)).toBe(feed)
    })
  })
})
