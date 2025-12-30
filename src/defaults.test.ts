import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultFetch, defaultParser } from './defaults.js'
import type { FeedsmithFeed, FetchFnResponse } from './types.js'

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
    it('should parse valid RSS feed', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
          </channel>
        </rss>
      `
      const result = await defaultParser.parse(value)

      expect(result).toBeDefined()
      expect(result?.format).toBe('rss')
    })

    it('should parse valid Atom feed', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test Feed</title>
        </feed>
      `
      const result = await defaultParser.parse(value)

      expect(result).toBeDefined()
      expect(result?.format).toBe('atom')
    })

    it('should parse valid JSON Feed', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test Feed',
      })
      const result = await defaultParser.parse(value)

      expect(result).toBeDefined()
      expect(result?.format).toBe('json')
    })

    it('should return undefined for invalid feed', async () => {
      const value = 'not a feed'
      const result = await defaultParser.parse(value)

      expect(result).toBeUndefined()
    })

    it('should return undefined for empty string', async () => {
      const value = ''
      const result = await defaultParser.parse(value)

      expect(result).toBeUndefined()
    })
  })

  describe('getSelfUrl', () => {
    it('should return self URL from JSON Feed', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: 'https://example.com/feed.json',
      })
      const expected = 'https://example.com/feed.json'
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should return undefined for JSON Feed without feed_url', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
      })
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBeUndefined()
    })

    it('should return self URL from Atom feed', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="https://example.com/feed.atom"/>
        </feed>
      `
      const expected = 'https://example.com/feed.atom'
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should return undefined for Atom feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="alternate" href="https://example.com"/>
        </feed>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBeUndefined()
    })

    it('should return self URL from RSS feed with atom:link', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
          <channel>
            <title>Test</title>
            <atom:link rel="self" href="https://example.com/feed.rss"/>
          </channel>
        </rss>
      `
      const expected = 'https://example.com/feed.rss'
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should return undefined for RSS feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBeUndefined()
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
  })

  describe('getSignature', () => {
    it('should return signature for JSON Feed without feed_url', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        items: [{ id: '1', content_text: 'Hello' }],
      })
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed)
      const expected = JSON.stringify(parsed.feed)

      expect(result).toBe(expected)
    })

    it('should neutralize feed_url in JSON Feed signature', async () => {
      const value1 = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: 'https://example.com/feed1.json',
        items: [{ id: '1' }],
      })
      const value2 = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: 'https://example.com/feed2.json',
        items: [{ id: '1' }],
      })
      const parsed1 = (await defaultParser.parse(value1)) as FeedsmithFeed
      const parsed2 = (await defaultParser.parse(value2)) as FeedsmithFeed

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1)
      const signature2 = defaultParser.getSignature(parsed2)

      expect(signature1).toBe(signature2)
    })

    it('should restore feed_url after generating signature', async () => {
      const expected = 'https://example.com/feed.json'
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: expected,
      })
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('json')

      if (parsed.format === 'json') {
        defaultParser.getSignature(parsed)

        expect(parsed.feed.feed_url).toBe(expected)
      }
    })

    it('should return signature for Atom feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
        </feed>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed)
      const expected = JSON.stringify(parsed.feed)

      expect(result).toBe(expected)
    })

    it('should neutralize self link in Atom feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="https://example.com/feed1.atom"/>
        </feed>
      `
      const value2 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="https://example.com/feed2.atom"/>
        </feed>
      `
      const parsed1 = (await defaultParser.parse(value1)) as FeedsmithFeed
      const parsed2 = (await defaultParser.parse(value2)) as FeedsmithFeed

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1)
      const signature2 = defaultParser.getSignature(parsed2)

      expect(signature1).toBe(signature2)
    })

    it('should restore self link href after generating Atom signature', async () => {
      const expected = 'https://example.com/feed.atom'
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="${expected}"/>
        </feed>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('atom')

      if (parsed.format === 'atom') {
        defaultParser.getSignature(parsed)
        const result = parsed.feed.links?.find((link) => link.rel === 'self')?.href

        expect(result).toBe(expected)
      }
    })

    it('should neutralize self link in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
          <channel>
            <title>Test</title>
            <atom:link rel="self" href="https://example.com/feed1.rss"/>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
          <channel>
            <title>Test</title>
            <atom:link rel="self" href="https://example.com/feed2.rss"/>
          </channel>
        </rss>
      `
      const parsed1 = (await defaultParser.parse(value1)) as FeedsmithFeed
      const parsed2 = (await defaultParser.parse(value2)) as FeedsmithFeed

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1)
      const signature2 = defaultParser.getSignature(parsed2)

      expect(signature1).toBe(signature2)
    })

    it('should restore self link href after generating RSS signature', async () => {
      const expected = 'https://example.com/feed.rss'
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
          <channel>
            <title>Test</title>
            <atom:link rel="self" href="${expected}"/>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('rss')

      if (parsed.format === 'rss') {
        defaultParser.getSignature(parsed)
        const result = parsed.feed.atom?.links?.find((link) => link.rel === 'self')?.href

        expect(result).toBe(expected)
      }
    })

    it('should return signature for RSS feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed)
      const expected = JSON.stringify(parsed.feed)

      expect(result).toBe(expected)
    })

    it('should neutralize lastBuildDate in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <lastBuildDate>Mon, 30 Dec 2024 10:00:00 GMT</lastBuildDate>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <lastBuildDate>Mon, 30 Dec 2024 11:00:00 GMT</lastBuildDate>
          </channel>
        </rss>
      `
      const parsed1 = (await defaultParser.parse(value1)) as FeedsmithFeed
      const parsed2 = (await defaultParser.parse(value2)) as FeedsmithFeed

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1)
      const signature2 = defaultParser.getSignature(parsed2)

      expect(signature1).toBe(signature2)
    })

    it('should restore lastBuildDate after generating RSS signature', async () => {
      const expected = 'Mon, 30 Dec 2024 10:00:00 GMT'
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <lastBuildDate>${expected}</lastBuildDate>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('rss')

      if (parsed.format === 'rss') {
        defaultParser.getSignature(parsed)

        expect(parsed.feed.lastBuildDate).toBe(expected)
      }
    })

    it('should neutralize updated in Atom feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <updated>2024-12-30T10:00:00Z</updated>
        </feed>
      `
      const value2 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <updated>2024-12-30T11:00:00Z</updated>
        </feed>
      `
      const parsed1 = (await defaultParser.parse(value1)) as FeedsmithFeed
      const parsed2 = (await defaultParser.parse(value2)) as FeedsmithFeed

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1)
      const signature2 = defaultParser.getSignature(parsed2)

      expect(signature1).toBe(signature2)
    })

    it('should restore updated after generating Atom signature', async () => {
      const expected = '2024-12-30T10:00:00Z'
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <updated>${expected}</updated>
        </feed>
      `
      const parsed = (await defaultParser.parse(value)) as FeedsmithFeed

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('atom')

      if (parsed.format === 'atom') {
        defaultParser.getSignature(parsed)

        expect(parsed.feed.updated).toBe(expected)
      }
    })
  })
})
