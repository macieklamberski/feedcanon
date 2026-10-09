import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultFetch, defaultParser } from './defaults.js'
import type { DefaultParserResult, FetchFnResponse } from './types.js'

describe('defaultFetch', () => {
  type MockResponse = Pick<Response, 'headers' | 'text' | 'url' | 'status'>

  const createFetchMock = (
    implementation: (url: string, options?: RequestInit) => Response | Promise<Response>,
  ): typeof fetch => {
    // @ts-expect-error: This is for testing purposes.
    return implementation
  }

  const createMockResponse = (partial: Partial<MockResponse>): Response => {
    const response: MockResponse = {
      headers: partial.headers ?? new Headers(),
      text: partial.text ?? (async () => ''),
      url: partial.url ?? '',
      status: partial.status ?? 200,
    }

    // @ts-expect-error: This is for testing purposes.
    return response
  }

  const fetchSpy = spyOn(globalThis, 'fetch')

  const mockRedirect = (status: number, location: string): Array<RequestInit | undefined> => {
    const capturedOptions: Array<RequestInit | undefined> = []
    fetchSpy.mockImplementation(
      createFetchMock((url: string, options?: RequestInit) => {
        capturedOptions.push(options)

        if (capturedOptions.length === 1) {
          return createMockResponse({ status, headers: new Headers({ location }) })
        }

        return createMockResponse({ url })
      }),
    )

    return capturedOptions
  }

  beforeEach(() => {
    fetchSpy.mockReset()
  })

  afterAll(() => {
    fetchSpy.mockRestore()
  })

  it('should call native fetch with correct URL', async () => {
    fetchSpy.mockImplementation(
      createFetchMock((url: string) => {
        return createMockResponse({
          url,
          text: async () => 'response body',
        })
      }),
    )
    const expected: FetchFnResponse = {
      url: 'https://example.com/feed.xml',
      body: 'response body',
      headers: expect.any(Headers),
      status: 200,
      redirects: [],
    }

    expect(await defaultFetch('https://example.com/feed.xml')).toEqual(expected)
  })

  it('should default to GET method when not specified', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml')

    const expected: RequestInit = {
      method: 'GET',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions).toEqual(expected)
  })

  it('should use specified method from options', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml', { method: 'HEAD' })

    const expected: RequestInit = {
      method: 'HEAD',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions).toEqual(expected)
  })

  it('should pass POST method and body to fetch', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/api', {
      method: 'POST',
      body: '{"key":"value"}',
    })

    const expected: RequestInit = {
      method: 'POST',
      headers: expect.any(Headers),
      body: '{"key":"value"}',
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions).toEqual(expected)
  })

  it('should pass headers to fetch', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml', {
      headers: { 'X-Custom': 'value' },
    })

    const customHeader = new Headers(capturedOptions?.headers).get('x-custom')

    expect(customHeader).toBe('value')
  })

  it('should send an Accept header preferring feed media types', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/feed.xml')

    const acceptHeader = new Headers(capturedOptions?.headers).get('accept')
    const expected =
      'application/atom+xml, application/rss+xml, application/feed+json, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.1'

    expect(acceptHeader).toBe(expected)
  })

  it('should let a caller-supplied Accept header override the default', async () => {
    let capturedOptions: RequestInit | undefined
    fetchSpy.mockImplementation(
      createFetchMock((_url: string, options?: RequestInit) => {
        capturedOptions = options
        return createMockResponse({})
      }),
    )

    await defaultFetch('https://example.com/api', {
      headers: { Accept: 'application/json' },
    })

    const acceptHeader = new Headers(capturedOptions?.headers).get('accept')

    expect(acceptHeader).toBe('application/json')
  })

  it('should return response with correct structure', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
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
      url: 'https://example.com/feed.xml',
      body: 'feed content',
      headers: expect.any(Headers),
      status: 200,
      redirects: [],
    }

    expect(result).toEqual(expected)
    expect(result.headers.get('content-type')).toBe('application/rss+xml')
  })

  it('should preserve response URL for redirect handling', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        return createMockResponse({
          url: 'https://redirect.example.com/feed.xml',
        })
      }),
    )
    const expected: FetchFnResponse = {
      url: 'https://redirect.example.com/feed.xml',
      body: '',
      headers: expect.any(Headers),
      status: 200,
      redirects: [],
    }

    expect(await defaultFetch('https://example.com/feed.xml')).toEqual(expected)
  })

  it('should convert response body to text', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        return createMockResponse({
          text: async () => '<rss>feed content</rss>',
        })
      }),
    )
    const expected: FetchFnResponse = {
      url: '',
      body: '<rss>feed content</rss>',
      headers: expect.any(Headers),
      status: 200,
      redirects: [],
    }

    expect(await defaultFetch('https://example.com/feed.xml')).toEqual(expected)
  })

  it('should pass through status', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        return createMockResponse({
          status: 404,
        })
      }),
    )
    const expected: FetchFnResponse = {
      url: '',
      body: '',
      headers: expect.any(Headers),
      status: 404,
      redirects: [],
    }

    expect(await defaultFetch('https://example.com/feed.xml')).toEqual(expected)
  })

  it('should record each redirect and resolve relative locations', async () => {
    const responses: Record<string, Partial<MockResponse>> = {
      'http://example.com/rss': {
        status: 301,
        headers: new Headers({ location: 'https://example.com/rss' }),
      },
      'https://example.com/rss': {
        status: 302,
        headers: new Headers({ location: '/feed.xml' }),
      },
      'https://example.com/feed.xml': {
        text: async () => '<rss></rss>',
      },
    }
    fetchSpy.mockImplementation(
      createFetchMock((url: string) => {
        return createMockResponse({ url, ...responses[url] })
      }),
    )
    const expected: FetchFnResponse = {
      url: 'https://example.com/feed.xml',
      body: '<rss></rss>',
      headers: expect.any(Headers),
      status: 200,
      redirects: [
        { url: 'http://example.com/rss', status: 301 },
        { url: 'https://example.com/rss', status: 302 },
      ],
    }

    expect(await defaultFetch('http://example.com/rss')).toEqual(expected)
  })

  it('should switch POST to GET without body after 303', async () => {
    const capturedOptions = mockRedirect(303, 'https://example.com/result')

    await defaultFetch('https://example.com/api', { method: 'POST', body: '{"key":"value"}' })

    const expected: RequestInit = {
      method: 'GET',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions[1]).toEqual(expected)
  })

  it('should drop Content-Type when 303 switches POST to GET', async () => {
    const capturedOptions = mockRedirect(303, 'https://example.com/result')

    await defaultFetch('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{"key":"value"}',
    })

    const headers = Object.fromEntries(new Headers(capturedOptions[1]?.headers))
    const expected = { accept: 'application/json' }

    expect(headers).toEqual(expected)
  })

  const postToGetStatuses: Array<number> = [301, 302]

  it.each(postToGetStatuses)('should switch POST to GET without body after %d', async (status) => {
    const capturedOptions = mockRedirect(status, 'https://example.com/result')

    await defaultFetch('https://example.com/api', { method: 'POST', body: '{"key":"value"}' })

    const expected: RequestInit = {
      method: 'GET',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions[1]).toEqual(expected)
  })

  it('should keep HEAD through 303', async () => {
    const capturedOptions = mockRedirect(303, 'https://example.com/result')

    await defaultFetch('https://example.com/feed', { method: 'HEAD' })

    const expected: RequestInit = {
      method: 'HEAD',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }

    expect(capturedOptions[1]).toEqual(expected)
  })

  it('should keep POST and Content-Type through 307', async () => {
    const capturedOptions = mockRedirect(307, 'https://example.com/api/v2')

    await defaultFetch('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    })

    const expected: RequestInit = {
      method: 'POST',
      headers: expect.any(Headers),
      body: '{"key":"value"}',
      signal: expect.any(AbortSignal),
      redirect: 'manual',
    }
    const headers = new Headers(capturedOptions[1]?.headers)

    expect(capturedOptions[1]).toEqual(expected)
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('should drop credentials when a redirect changes origin', async () => {
    const capturedOptions = mockRedirect(301, 'https://example.org/feed')

    await defaultFetch('https://example.com/feed', {
      headers: {
        Accept: 'application/rss+xml',
        Authorization: 'Bearer token',
        Cookie: 'session=1',
        'Proxy-Authorization': 'Basic cHJveHk6c2VjcmV0',
      },
    })

    const headers = Object.fromEntries(new Headers(capturedOptions[1]?.headers))
    const expected = { accept: 'application/rss+xml' }

    expect(headers).toEqual(expected)
  })

  it('should keep credentials when a redirect stays on the same origin', async () => {
    const capturedOptions = mockRedirect(301, 'https://example.com/rss')

    await defaultFetch('https://example.com/feed', {
      headers: {
        Accept: 'application/rss+xml',
        Authorization: 'Bearer token',
      },
    })

    const headers = Object.fromEntries(new Headers(capturedOptions[1]?.headers))
    const expected = {
      accept: 'application/rss+xml',
      authorization: 'Bearer token',
    }

    expect(headers).toEqual(expected)
  })

  it('should throw when a redirect leads to a non-HTTP URL', () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        return createMockResponse({
          status: 302,
          headers: new Headers({ location: 'data:application/rss+xml,<rss></rss>' }),
        })
      }),
    )
    const throwing = () => defaultFetch('https://example.com/feed')

    expect(throwing()).rejects.toThrow('Redirect to a non-HTTP URL')
  })

  it('should throw after 20 redirects', async () => {
    fetchSpy.mockImplementation(
      createFetchMock((url: string) => {
        return createMockResponse({
          url,
          status: 302,
          headers: new Headers({ location: `${url}x` }),
        })
      }),
    )
    const throwing = () => defaultFetch('https://example.com/feed')

    await expect(throwing()).rejects.toThrow('Too many redirects')
    expect(fetchSpy).toHaveBeenCalledTimes(21)
  })

  it('should propagate error when native fetch throws', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const throwing = () => defaultFetch('https://example.com/feed.xml')

    await expect(throwing()).rejects.toThrow('Failed to fetch')
  })

  it('should propagate error when response.text() rejects', async () => {
    fetchSpy.mockImplementation(
      createFetchMock(() => {
        return createMockResponse({
          text: () => Promise.reject(new TypeError('Body stream interrupted')),
        })
      }),
    )
    const throwing = () => defaultFetch('https://example.com/feed.xml')

    await expect(throwing()).rejects.toThrow('Body stream interrupted')
  })
})

describe('defaultParser', () => {
  const parseOrThrow = async (body: string) => {
    const parsed = await defaultParser.parse(body)

    if (!parsed) {
      throw new Error('Expected feed to parse')
    }

    return parsed
  }

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

      expect(await defaultParser.parse(value)).toEqual(expect.objectContaining({ format: 'rss' }))
    })

    it('should parse valid Atom feed', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test Feed</title>
        </feed>
      `

      expect(await defaultParser.parse(value)).toEqual(expect.objectContaining({ format: 'atom' }))
    })

    it('should parse valid JSON Feed', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test Feed',
      })

      expect(await defaultParser.parse(value)).toEqual(expect.objectContaining({ format: 'json' }))
    })

    it('should parse valid RDF feed', async () => {
      const value = `
        <?xml version="1.0"?>
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
          <channel rdf:about="https://example.com/feed.rdf">
            <title>Test Feed</title>
            <link>https://example.com</link>
          </channel>
        </rdf:RDF>
      `

      expect(await defaultParser.parse(value)).toEqual(expect.objectContaining({ format: 'rdf' }))
    })

    it('should return undefined for invalid feed', async () => {
      const value = 'not a feed'

      expect(await defaultParser.parse(value)).toBeUndefined()
    })

    it('should return undefined for empty string', async () => {
      const value = ''

      expect(await defaultParser.parse(value)).toBeUndefined()
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
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should return undefined for JSON Feed without feed_url', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
      })
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBeUndefined()
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
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should return undefined for Atom feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="alternate" href="https://example.com"/>
        </feed>
      `
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBeUndefined()
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
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
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
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBeUndefined()
    })

    it('should extract self URL from RDF feed', () => {
      const value: DefaultParserResult = {
        format: 'rdf',
        feed: {
          atom: {
            links: [{ rel: 'self', href: 'https://example.com/rdf.xml' }],
          },
        },
      }

      const expected = 'https://example.com/rdf.xml'

      expect(defaultParser.getSelfUrl(value, 'https://example.com/feed')).toBe(expected)
    })

    it('should return undefined for RDF feed without atom links', () => {
      const value: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
        },
      }

      expect(defaultParser.getSelfUrl(value, 'https://example.com/feed')).toBeUndefined()
    })

    it('should match self link with uppercase rel', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="SELF" href="https://example.com/feed.atom"/>
        </feed>
      `
      const expected = 'https://example.com/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should match self link with IANA relation IRI', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link
            rel="http://www.iana.org/assignments/relation/self"
            href="https://example.com/feed.atom"
          />
        </feed>
      `
      const expected = 'https://example.com/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should return relative self href unchanged without xml:base', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="feed.atom"/>
        </feed>
      `
      const parsed = await parseOrThrow(value)
      const expected = 'feed.atom'

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should resolve self href against absolute xml:base', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/blog/">
          <title>Test</title>
          <link rel="self" href="feed.atom"/>
        </feed>
      `
      const expected = 'https://example.org/blog/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })

    it('should resolve self href against relative xml:base and retrieval URL', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0" xml:base="/blog/" xmlns:atom="http://www.w3.org/2005/Atom">
          <channel>
            <title>Test</title>
            <atom:link rel="self" href="feed.rss"/>
          </channel>
        </rss>
      `
      const expected = 'https://example.com/blog/feed.rss'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feeds/main')).toBe(expected)
    })

    it('should resolve self href against absolute xml:base without retrieval URL', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/blog/">
          <title>Test</title>
          <link rel="self" href="feed.atom"/>
        </feed>
      `
      const expected = 'https://example.org/blog/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should return self href as is with relative xml:base and no retrieval URL', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xml:base="/blog/">
          <title>Test</title>
          <link rel="self" href="feed.atom"/>
        </feed>
      `
      const parsed = await parseOrThrow(value)
      const expected = 'feed.atom'

      expect(defaultParser.getSelfUrl(parsed)).toBe(expected)
    })

    it('should keep absolute self href when xml:base is set', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/blog/">
          <title>Test</title>
          <link rel="self" href="https://example.com/feed.atom"/>
        </feed>
      `
      const expected = 'https://example.com/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSelfUrl(parsed, 'https://example.com/feed')).toBe(expected)
    })
  })

  describe('getSignature', () => {
    it('should return signature for JSON Feed without feed_url', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        items: [{ id: '1', content_text: 'Hello' }],
      })
      const expected = '{"title":"Test","items":[{"id":"1","content_text":"Hello"}]}'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSignature(parsed, 'https://example.com/feed.json')).toBe(expected)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.json')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.json')

      expect(signature1).toBe(signature2)
    })

    it('should restore feed_url after generating signature', async () => {
      const value = JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Test',
        feed_url: 'https://example.com/feed.json',
      })
      const expected = 'https://example.com/feed.json'
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('json')

      if (parsed.format !== 'json') {
        throw new Error('Expected JSON Feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.json')

      expect(parsed.feed.feed_url).toBe(expected)
    })

    it('should return signature for Atom feed without self link', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
        </feed>
      `
      const expected = '{"title":{"value":"Test"}}'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSignature(parsed, 'https://example.com/feed.atom')).toBe(expected)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.atom')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.atom')

      expect(signature1).toBe(signature2)
    })

    it('should restore self link href after generating Atom signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="self" href="https://example.com/feed.atom"/>
        </feed>
      `
      const expected = 'https://example.com/feed.atom'
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('atom')

      if (parsed.format !== 'atom') {
        throw new Error('Expected Atom feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.atom')

      const selfHref = parsed.feed.links?.find((link) => link.rel === 'self')?.href

      expect(selfHref).toBe(expected)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed1.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed2.rss')

      expect(signature1).toBe(signature2)
    })

    it('should restore self link href after generating RSS signature', async () => {
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
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('rss')

      if (parsed.format !== 'rss') {
        throw new Error('Expected RSS feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.rss')

      const selfHref = parsed.feed.atom?.links?.find((link) => link.rel === 'self')?.href

      expect(selfHref).toBe(expected)
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
      const expected = '{"title":"Test"}'
      const parsed = await parseOrThrow(value)

      expect(defaultParser.getSignature(parsed, 'https://example.com/feed.rss')).toBe(expected)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })

    it('should restore lastBuildDate after generating RSS signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <lastBuildDate>Mon, 30 Dec 2024 10:00:00 GMT</lastBuildDate>
          </channel>
        </rss>
      `
      const expected = 'Mon, 30 Dec 2024 10:00:00 GMT'
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('rss')

      if (parsed.format !== 'rss') {
        throw new Error('Expected RSS feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.rss')

      expect(parsed.feed.lastBuildDate).toBe(expected)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })

    it('should restore link after generating RSS signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <link>https://example.com/feed</link>
          </channel>
        </rss>
      `
      const expected = 'https://example.com/feed'
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('rss')

      if (parsed.format !== 'rss') {
        throw new Error('Expected RSS feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.rss')

      expect(parsed.feed.link).toBe(expected)
    })

    it('should neutralize link in RDF feed signature', () => {
      const value1: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          link: 'https://example.com/feed',
        },
      }
      const value2: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          link: 'https://example.com/feed/',
        },
      }

      const signature1 = defaultParser.getSignature(value1, 'https://example.com/feed.rdf')
      const signature2 = defaultParser.getSignature(value2, 'https://example.com/feed.rdf')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize channel dc:date in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel>
            <title>Test</title>
            <dc:date>2024-12-30T10:00:00Z</dc:date>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
          <channel>
            <title>Test</title>
            <dc:date>2024-12-30T11:00:00Z</dc:date>
          </channel>
        </rss>
      `
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize channel dc:date in RDF feed signature', () => {
      const value1: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          dc: { dates: ['2024-12-30T10:00:00Z'] },
        },
      }
      const value2: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          dc: { dates: ['2024-12-30T11:00:00Z'] },
        },
      }

      const signature1 = defaultParser.getSignature(value1, 'https://example.com/feed.rdf')
      const signature2 = defaultParser.getSignature(value2, 'https://example.com/feed.rdf')

      expect(signature1).toBe(signature2)
    })

    it('should restore channel dc:date after generating RDF signature', () => {
      const value: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          dc: { dates: ['2024-12-30T10:00:00Z'] },
        },
      }
      const expected = { dates: ['2024-12-30T10:00:00Z'] }

      defaultParser.getSignature(value, 'https://example.com/feed.rdf')

      expect(value.feed.dc).toEqual(expected)
    })

    it('should restore link after generating RDF signature', () => {
      const value: DefaultParserResult = {
        format: 'rdf',
        feed: {
          title: 'Test',
          link: 'https://example.com/feed',
        },
      }
      const expected = 'https://example.com/feed'

      defaultParser.getSignature(value, 'https://example.com/feed.rdf')

      expect(value.feed.link).toBe(expected)
    })

    it('should neutralize alternate link host in Atom feed signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link href="https://example.com/"/>
          <entry>
            <link href="https://example.com/post/1"/>
          </entry>
        </feed>
      `
      const parsed = await parseOrThrow(value)

      const signature1 = defaultParser.getSignature(parsed, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed, 'https://feeds.example.com/atom')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize link with rel="alternate" in Atom feed signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link rel="alternate" href="https://example.com/"/>
          <entry>
            <link href="https://example.com/post/1"/>
          </entry>
        </feed>
      `
      const parsed = await parseOrThrow(value)

      const signature1 = defaultParser.getSignature(parsed, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed, 'https://feeds.example.com/atom')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize link with IANA alternate relation IRI in Atom feed signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <link
            rel="http://www.iana.org/assignments/relation/alternate"
            href="https://example.com/"
          />
          <entry>
            <link href="https://example.com/post/1"/>
          </entry>
        </feed>
      `
      const parsed = await parseOrThrow(value)

      const signature1 = defaultParser.getSignature(parsed, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed, 'https://feeds.example.com/atom')

      expect(signature1).toBe(signature2)
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
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.atom')

      expect(signature1).toBe(signature2)
    })

    it('should restore updated after generating Atom signature', async () => {
      const value = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <updated>2024-12-30T10:00:00Z</updated>
        </feed>
      `
      const expected = '2024-12-30T10:00:00Z'
      const parsed = await parseOrThrow(value)

      expect(parsed.format).toBe('atom')

      if (parsed.format !== 'atom') {
        throw new Error('Expected Atom feed')
      }

      defaultParser.getSignature(parsed, 'https://example.com/feed.atom')

      expect(parsed.feed.updated).toBe(expected)
    })

    // This is an integration test to verify getSignature uses neutralizeUrls.
    it('should normalize URLs via neutralizeUrls integration', async () => {
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
      const parsed = await parseOrThrow(value)

      const signature1 = defaultParser.getSignature(parsed, 'https://example.com/feed')
      const signature2 = defaultParser.getSignature(parsed, 'http://www.example.com/feed/')

      expect(signature1).toBe(signature2)
      expect(signature1).toContain('/post/1')
      expect(signature1).not.toContain('https://example.com')
    })

    it('should neutralize generator in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <generator>WordPress 6.4</generator>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <generator>WordPress 6.5</generator>
          </channel>
        </rss>
      `
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize generator in Atom feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <generator>Hugo</generator>
        </feed>
      `
      const value2 = `
        <?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Test</title>
          <generator>Jekyll</generator>
        </feed>
      `
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.atom')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.atom')

      expect(signature1).toBe(signature2)
    })

    it('should neutralize pubDate in RSS feed signature', async () => {
      const value1 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <pubDate>Mon, 30 Dec 2024 10:00:00 GMT</pubDate>
          </channel>
        </rss>
      `
      const value2 = `
        <?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <pubDate>Mon, 30 Dec 2024 11:00:00 GMT</pubDate>
          </channel>
        </rss>
      `
      const parsed1 = await parseOrThrow(value1)
      const parsed2 = await parseOrThrow(value2)

      const signature1 = defaultParser.getSignature(parsed1, 'https://example.com/feed.rss')
      const signature2 = defaultParser.getSignature(parsed2, 'https://example.com/feed.rss')

      expect(signature1).toBe(signature2)
    })
  })
})
