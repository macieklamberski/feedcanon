import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultFetch, defaultParser, neutralizeFeedUrls } from './defaults.js'
import type { DefaultParserResult, FetchFnResponse } from './types.js'

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should return undefined for JSON Feed without feed_url', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
      })
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed, 'https://example.com/feed.json')
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
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.json')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.json')

      expect(signature1).toBe(signature2)
    })

    it('should restore feed_url after generating signature', async () => {
      const expected = 'https://example.com/feed.json'
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: expected,
      })
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('json')

      if (parsed.format === 'json') {
        defaultParser.getSignature(parsed, expected)

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed, 'https://example.com/feed.atom')
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
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.atom')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.atom')

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('atom')

      if (parsed.format === 'atom') {
        defaultParser.getSignature(parsed, expected)
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
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.rss')

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('rss')

      if (parsed.format === 'rss') {
        defaultParser.getSignature(parsed, expected)
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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()

      const result = defaultParser.getSignature(parsed, 'https://example.com/feed.rss')
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
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('rss')

      if (parsed.format === 'rss') {
        defaultParser.getSignature(parsed, 'https://example.com/feed.rss')

        expect(parsed.feed.lastBuildDate).toBe(expected)
      }
    })

    it('should neutralize link in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <link>https://example.com/feed</link>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <link>https://example.com/feed/</link>
          </channel>
        </rss>
      `
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })

    it('should restore link after generating RSS signature', async () => {
      const expected = 'https://example.com/feed'
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <link>${expected}</link>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('rss')

      if (parsed.format === 'rss') {
        defaultParser.getSignature(parsed, 'https://example.com/feed.rss')

        expect(parsed.feed.link).toBe(expected)
      }
    })

    it('should neutralize link in RDF feed signature', async () => {
      const value1 = {
        format: 'rdf' as const,
        feed: {
          title: 'Test',
          link: 'https://example.com/feed',
        },
      }
      const value2 = {
        format: 'rdf' as const,
        feed: {
          title: 'Test',
          link: 'https://example.com/feed/',
        },
      }

      const signature1 = defaultParser.getSignature(value1, 'https://example.com/feed.rdf')
      const signature2 = defaultParser.getSignature(value2, 'https://example.com/feed.rdf')

      expect(signature1).toBe(signature2)
    })

    it('should restore link after generating RDF signature', () => {
      const expected = 'https://example.com/feed'
      const value = {
        format: 'rdf' as const,
        feed: {
          title: 'Test',
          link: expected,
        },
      }

      defaultParser.getSignature(value, 'https://example.com/feed.rdf')

      expect(value.feed.link).toBe(expected)
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
      const parsed1 = (await defaultParser.parse(value1)) as DefaultParserResult
      const parsed2 = (await defaultParser.parse(value2)) as DefaultParserResult

      expect(parsed1).toBeDefined()
      expect(parsed2).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.atom')

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
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()
      expect(parsed.format).toBe('atom')

      if (parsed.format === 'atom') {
        defaultParser.getSignature(parsed, 'https://example.com/feed.atom')

        expect(parsed.feed.updated).toBe(expected)
      }
    })

    // This is an integration test to verify getSignature uses neutralizeFeedUrls.
    it('should normalize URLs via neutralizeFeedUrls integration', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <item>
              <link>https://example.com/post/1</link>
            </item>
          </channel>
        </rss>
      `
      const parsed = (await defaultParser.parse(value)) as DefaultParserResult

      expect(parsed).toBeDefined()

      const signature1 = defaultParser.getSignature(parsed, 'https://example.com/feed')
      const signature2 = defaultParser.getSignature(parsed, 'http://www.example.com/feed/')

      expect(signature1).toBe(signature2)
      expect(signature1).toContain('/post/1')
      expect(signature1).not.toContain('https://example.com')
    })
  })
})

describe('neutralizeFeedUrls', () => {
  describe('same-domain normalization', () => {
    it('should normalize https same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize http same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"http://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize www same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://www.example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize same-domain URL when feed URL has www', () => {
      const url = 'https://www.example.com/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle multiple same-domain URLs in signature', () => {
      const url = 'https://example.com/feed'
      const value = '{"a":"https://example.com/post/1","b":"https://example.com/post/2"}'
      const expected = '{"a":"/post/1","b":"/post/2"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize bare https same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize bare http same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"http://example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize bare www same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://www.example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize same-domain URLs in query parameters', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://tracker.com/click?url=https://example.com/post"}'
      const expected = '{"link":"https://tracker.com/click?url=/post"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle mixed same-domain and external URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"internal":"https://example.com/post","external":"https://other.com/path"}'
      const expected = '{"internal":"/post","external":"https://other.com/path"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle feed from subdomain normalizing its own URLs', () => {
      const url = 'https://blog.example.com/feed'
      const value = '{"link":"https://blog.example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not normalize parent domain URLs when feed is on subdomain', () => {
      const url = 'https://blog.example.com/feed'
      const value = '{"link":"https://example.com/main"}'
      const expected = '{"link":"https://example.com/main"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com:8080/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not normalize different port URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com:3000/post/1"}'
      const expected = '{"link":"https://example.com:3000/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not normalize portless URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"https://example.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle same-domain URLs in JSON arrays', () => {
      const url = 'https://example.com/feed'
      const value = '["https://example.com/a","https://example.com/b"]'
      const expected = '["/a","/b"]'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve path case when normalizing domain', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/Path/To/Page"}'
      const expected = '{"link":"/Path/To/Page"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })
  })

  describe('trailing slash normalization', () => {
    it('should strip trailing slash from https URL before quote', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/"}'
      const expected = '{"link":"https://external.com/path"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash from root-relative path before quote', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/path/"}'
      const expected = '{"link":"/path"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve root "/" path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/"}'
      const expected = '{"link":"/"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash from deep path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/a/b/c/d/"}'
      const expected = '{"link":"/a/b/c/d"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash before query from https URL', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/?page=2"}'
      const expected = '{"link":"https://external.com/path?page=2"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash before query from root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/path/?page=2"}'
      const expected = '{"link":"/path?page=2"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle query string with multiple parameters', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/feed/json/?paged=2&format=json"}'
      const expected = '{"link":"/feed/json?paged=2&format=json"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize same-domain URL and strip trailing slash', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/post/1/"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should normalize same-domain URL with query and strip trailing slash', () => {
      const url = 'https://example.com/rss'
      const value = '{"link":"https://example.com/feed/?page=2"}'
      const expected = '{"link":"/feed?page=2"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not strip trailing slash before fragment', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/#section"}'
      const expected = '{"link":"https://external.com/path/#section"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash before query even with fragment', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/?page=1#section"}'
      const expected = '{"link":"https://external.com/path?page=1#section"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should only strip last trailing slash (multiple slashes)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path//"}'
      const expected = '{"link":"https://external.com/path/"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should strip trailing slash from http URL', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"http://external.com/path/"}'
      const expected = '{"link":"http://external.com/path"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })
  })

  describe('security edge cases', () => {
    it('should not match domain suffix attack (example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com.evil.com/post/1"}'
      const expected = '{"link":"https://example.com.evil.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not normalize URLs with ports', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com:8080/post/1"}'
      const expected = '{"link":"https://example.com:8080/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not match subdomains of feed domain', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://api.example.com/post/1"}'
      const expected = '{"link":"https://api.example.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not match similar domain with different prefix (notexample.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://notexample.com/post/1"}'
      const expected = '{"link":"https://notexample.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle domain with hyphen correctly', () => {
      const url = 'https://my-example.com/feed'
      const value = '{"link":"https://my-example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not match partial domain (example vs example.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example/post/1"}'
      const expected = '{"link":"https://example/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should not match www variant of suffix attack (www.example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://www.example.com.evil.com/post/1"}'
      const expected = '{"link":"https://www.example.com.evil.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })
  })

  describe('preservation cases', () => {
    it('should preserve external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/post/1"}'
      const expected = '{"link":"https://external.com/post/1"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve bare external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://external.com"}'
      const expected = '{"href":"https://external.com"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve URLs embedded in text (not standalone JSON values)', () => {
      const url = 'https://example.com/feed'
      const value = '{"description":"Visit https://example.com for more"}'
      const expected = '{"description":"Visit https://example.com for more"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve bare domain followed by space in text', () => {
      const url = 'https://example.com/feed'
      const value = '{"text":"Check https://example.com now"}'
      const expected = '{"text":"Check https://example.com now"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should preserve URLs with authentication', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://user:pass@example.com/path"}'
      const expected = '{"link":"https://user:pass@example.com/path"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })
  })

  describe('error handling', () => {
    it('should return original signature for invalid URL', () => {
      const url = 'not-a-valid-url'
      const value = '{"title":"Test"}'
      const expected = '{"title":"Test"}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle empty signature', () => {
      const url = 'https://example.com/feed'
      const value = ''
      const expected = ''

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })

    it('should handle signature with no URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"title":"Hello","count":42}'
      const expected = '{"title":"Hello","count":42}'

      expect(neutralizeFeedUrls(value, url)).toBe(expected)
    })
  })

  // Tests documenting current behavior for potential future normalizations.
  // These URLs are currently NOT normalized but could be considered for implementation.
  describe('potential normalizations (not yet implemented)', () => {
    it('should normalize protocol-relative URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"//example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).not.toBe(expected)
    })

    it('should normalize uppercase protocol URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"HTTPS://EXAMPLE.COM/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).not.toBe(expected)
    })

    it('should normalize uppercase domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://EXAMPLE.COM/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeFeedUrls(value, url)).not.toBe(expected)
    })
  })
})
