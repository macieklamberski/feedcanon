import { afterAll, describe, expect, it, spyOn } from 'bun:test'
import { defaultParser } from './defaults.js'
import { findCanonical } from './index.js'
import { wordpressProbe } from './probes/wordpress.js'
import { bloggerRewrite } from './rewrites/blogger.js'
import { feedburnerRewrite } from './rewrites/feedburner.js'
import type {
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
  Probe,
  Rewrite,
} from './types.js'

// Stand-in for an injected cleaner (e.g. urlpurify): removes doing_wp_cron.
const stripWpCron = (url: string): string => {
  const parsed = new URL(url)
  parsed.searchParams.delete('doing_wp_cron')
  return parsed.toString()
}

describe('findCanonical', () => {
  // Helper that provides type context for options, enabling proper callback typing.
  const toOptions = <T>(o: FindCanonicalOptions<T> & { parser: ParserAdapter<T> }) => o

  const createMockParser = (selfUrl: string | undefined): ParserAdapter<string> => {
    return {
      parse: (body) => body,
      getSelfUrl: () => selfUrl,
      getSignature: (parsed) => parsed,
    }
  }

  const createMockFetch = (responses: Record<string, Partial<FetchFnResponse>>) => {
    return (url: string): FetchFnResponse => {
      const response = responses[url]

      if (!response) {
        throw new Error(`No mock for ${url}`)
      }

      return {
        status: response.status ?? 200,
        url: response.url ?? url,
        body: response.body ?? '',
        headers: response.headers ?? new Headers(),
        redirects: response.redirects,
      }
    }
  }

  describe('core behavior', () => {
    describe('self URL handling', () => {
      it('should ignore a Link header self URL that is not http', async () => {
        const value = 'https://example.com/feed'
        const fetchCalls: Array<string> = []
        const mockFetch = createMockFetch({
          'https://example.com/feed': {
            body: '<feed></feed>',
            headers: new Headers({ link: '<ftp://example.com/feed>; rel="self"' }),
          },
        })
        const options = toOptions({
          fetchFn: (url) => {
            fetchCalls.push(url)
            return mockFetch(url)
          },
          parser: createMockParser(undefined),
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual([value])
      })

      it('should not fetch a self URL equal to the final URL of a temporary redirect', async () => {
        const value = 'http://example.com/feed'
        const expected = ['http://example.com/feed']
        const fetchCalls: Array<string> = []
        const body = '<feed></feed>'
        const mockFetch = createMockFetch({
          'http://example.com/feed': {
            body,
            url: 'https://example.com/feed',
            redirects: [{ url: 'http://example.com/feed', status: 302 }],
          },
          'https://example.com/feed': { body },
        })
        const options = toOptions({
          fetchFn: (url) => {
            fetchCalls.push(url)
            return mockFetch(url)
          },
          parser: createMockParser('https://example.com/feed'),
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should return a self URL equal to the final URL of a temporary redirect', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': {
              body,
              url: 'https://example.com/feed',
              redirects: [{ url: 'http://example.com/feed', status: 302 }],
            },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should match self URL when initial feed came through a temporary redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://feeds.example.net/feed'
        const createBody = (date: string) => `
          <?xml version="1.0"?>
          <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
            <channel>
              <title>Example</title>
              <link>https://example.com</link>
              <lastBuildDate>${date}</lastBuildDate>
              <atom:link rel="self" href="https://feeds.example.net/feed"/>
              <item>
                <title>Post</title>
                <link>https://feeds.example.net/~r/post</link>
              </item>
            </channel>
          </rss>
        `
        const fetchFn = createMockFetch({
          'https://example.com/feed': {
            body: createBody('Mon, 01 Jan 2024 00:00:00 GMT'),
            url: 'https://feeds.example.net/feed',
            redirects: [{ url: 'https://example.com/feed', status: 302 }],
          },
          'https://feeds.example.net/feed': { body: createBody('Tue, 02 Jan 2024 00:00:00 GMT') },
        })

        expect(await findCanonical(value, { fetchFn })).toBe(expected)
      })

      it('should adopt cleaner self URL when valid', async () => {
        const value = 'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567'
        const expected = 'https://blog.example.com/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567': { body },
            'https://blog.example.com/rss.xml': { body },
          }),
          parser: createMockParser('https://blog.example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use initialResponseUrl when self URL does not work', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://old.example.com/feed': { status: 404 },
          }),
          parser: createMockParser('https://old.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use initialResponseUrl when self URL produces different content', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>summary</feed>' },
            'https://example.com/feed/full': { body: '<feed>full content</feed>' },
          }),
          parser: createMockParser('https://example.com/feed/full'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should prefer non-www when both work', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle feed:// protocol in self URL', async () => {
        const value = 'https://example.com/rss.xml'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('feed://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should resolve relative self URL', async () => {
        const value = 'https://example.com/blog/feed.xml'
        const expected = 'https://example.com/blog/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/blog/feed.xml': { body },
          }),
          parser: createMockParser('feed.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should resolve relative self URL against xml:base', async () => {
        const value = 'https://example.com/old/feed.xml'
        const expected = 'https://example.com/blog/feed.xml'
        const body = `
          <?xml version="1.0"?>
          <feed xmlns="http://www.w3.org/2005/Atom" xml:base="/blog/">
            <title>Test</title>
            <link rel="self" href="feed.xml"/>
          </feed>
        `
        const fetchFn = createMockFetch({
          'https://example.com/old/feed.xml': { body },
          'https://example.com/blog/feed.xml': { body },
        })

        expect(await findCanonical(value, { fetchFn })).toBe(expected)
      })

      it('should prefer Link header self URL over feed self URL', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              headers: new Headers({ link: '<https://example.com/rss.xml>; rel="self"' }),
            },
            'https://example.com/rss.xml': { body },
            'https://example.com/atom.xml': { body },
          }),
          parser: createMockParser('https://example.com/atom.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should stop at Link header self URL equal to response URL with unsorted query', async () => {
        const value = 'https://example.com/feed?b=1&a=2'
        const expected = 'https://example.com/feed?b=1&a=2'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?b=1&a=2': {
              body,
              headers: new Headers({ link: '<https://example.com/feed?b=1&a=2>; rel="self"' }),
            },
            'https://example.com/atom.xml': { body },
          }),
          parser: createMockParser('https://example.com/atom.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep self URL query in declared order', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/rss?b=1&a=2'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com/rss?b=1&a=2': { body },
          }),
          parser: createMockParser('https://example.com/rss?b=1&a=2'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use feed self URL when Link header has no self link', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              headers: new Headers({ link: '<https://hub.example.com/>; rel="hub"' }),
            },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('https://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use self URL from Link header with several links', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const link =
          '<https://hub.example.com/>; rel="hub", <https://example.com/rss.xml>; rel=self'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': { body, headers: new Headers({ link }) },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should ignore rel inside a quoted Link header parameter', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const link =
          '<https://example.com/atom.xml>; title="News; rel=self daily"; rel="alternate", <https://example.com/rss.xml>; rel="self"'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': { body, headers: new Headers({ link }) },
            'https://example.com/atom.xml': { body },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use the Link header self link after a link without rel', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const link =
          '<https://example.com/style.css>; type="text/css", <https://example.com/rss.xml>; rel="self"'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': { body, headers: new Headers({ link }) },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip a Link header self link with an empty target', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const link = '<>; rel="self", <https://example.com/rss.xml>; rel="self"'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': { body, headers: new Headers({ link }) },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should resolve relative Link header self URL against response URL', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://feeds.example.com/blog/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              url: 'https://feeds.example.com/blog/feed?format=rss',
              headers: new Headers({ link: '<rss.xml>; rel="self"' }),
            },
            'https://feeds.example.com/blog/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep character reference text in a Link header self URL', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/a&amp;b/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              headers: new Headers({ link: '<https://example.com/a&amp;b/rss.xml>; rel="self"' }),
            },
            'https://example.com/a&amp;b/rss.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should try feed self URL when Link header self URL fails', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              headers: new Headers({ link: '<https://example.com/old.xml>; rel="self"' }),
            },
            'https://example.com/old.xml': { status: 404 },
            'http://example.com/old.xml': { status: 404 },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('https://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch feed self URL when Link header self URL verifies', async () => {
        const value = 'https://example.com/feed?format=rss'
        const fetchedUrls: Array<string> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': {
              body,
              headers: new Headers({ link: '<https://example.com/rss.xml>; rel="self"' }),
            },
            'https://example.com/rss.xml': { body },
            'https://example.com/atom.xml': { body },
          }),
          parser: createMockParser('https://example.com/atom.xml'),
          onFetch: ({ url }) => {
            fetchedUrls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchedUrls).not.toContain('https://example.com/atom.xml')
      })

      it('should use initialResponseUrl when no self URL present', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should ignore self URL that points to non-feed content', async () => {
        const value = 'https://example.com/feed.xml'
        const expected = 'https://example.com/feed.xml'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed.xml': { body: '<feed></feed>' },
            'https://example.com/blog': { body: '<!DOCTYPE html><html></html>' },
          }),
          parser: createMockParser('https://example.com/blog'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use redirect destination when self URL redirects', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://old.example.com/rss': { body, url: 'https://example.com/feed' },
          }),
          parser: createMockParser('https://old.example.com/rss'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should prefer lowercase URL path when content matches', async () => {
        const value = 'https://example.com/Blog/Feed.XML'
        const expected = 'https://example.com/blog/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/Blog/Feed.XML': { body },
            'https://example.com/blog/feed.xml': { body },
          }),
          parser: createMockParser('https://example.com/blog/feed.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle scheme-relative URL by defaulting to HTTPS', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('//example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip fragment from self URL', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed#section'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle self URL with different protocol', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'http://example.com/feed': { body },
          }),
          parser: createMockParser('http://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use self URL redirect destination as candidate source', async () => {
        const value = 'https://old.example.com/feed'
        const expected = 'https://new.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://old.example.com/feed': { body },
            'https://alias.example.com/feed': { body, url: 'https://new.example.com/feed' },
            'https://new.example.com/feed': { body },
          }),
          parser: createMockParser('https://alias.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('protocol handling', () => {
      it('should not retry an https candidate that redirects temporarily to http', async () => {
        const value = 'http://example.com/feed/'
        const expected = 'https://example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed/': { body },
            'https://example.com/feed/': { body },
            'https://example.com/feed': {
              body,
              url: 'http://example.com/other',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep http when the https URL redirects temporarily to another http URL', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'http://example.com/other',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should upgrade HTTP to HTTPS when content matches', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should upgrade HTTP to HTTPS when share links encode the request protocol', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const createBody = (protocol: string) => {
          return `
            <rss version="2.0">
              <channel>
                <title>Example</title>
                <item>
                  <title>Post</title>
                  <description>https://share.example.org/share?url=${protocol}%3A%2F%2Fexample.com%2Fpost</description>
                </item>
              </channel>
            </rss>
          `
        }
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body: createBody('http') },
            'https://example.com/feed': { body: createBody('https') },
          }),
          parser: defaultParser,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fetch no other HTTPS candidate when HTTP wins with the cleanest URL', async () => {
        const value = 'http://example.com/feed'
        const fetchedUrls: Array<string> = []
        const expected = ['http://example.com/feed', 'https://example.com/feed']
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          onFetch: ({ url }) => {
            fetchedUrls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchedUrls).toEqual(expected)
      })

      it('should keep HTTP when HTTPS fails', async () => {
        const value = 'http://legacy.example.com/feed.rss'
        const expected = 'http://legacy.example.com/feed.rss'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://legacy.example.com/feed.rss': { body },
            'https://legacy.example.com/feed.rss': { status: 500 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTP when HTTPS redirects back to it', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body, url: 'http://example.com/feed' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTP when HTTPS redirects back to it temporarily', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'http://example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return known URL when HTTPS redirects permanently to it', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'http://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'http://www.example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTPS winner when cleaner HTTPS candidate redirects back to HTTP', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'http://example.com/feed': { status: 404 },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'http://www.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTPS winner when cleaner HTTPS candidate redirects back to HTTP served from HTTPS', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': {
              body,
              url: 'https://cdn.example.com/feed',
              redirects: [{ url: 'http://www.example.com/feed', status: 302 }],
            },
            'http://example.com/feed': { status: 404 },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://cdn.example.com/feed',
              redirects: [
                { url: 'https://example.com/feed', status: 301 },
                { url: 'http://www.example.com/feed', status: 302 },
              ],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return stored HTTP URL when cleaner HTTPS candidate redirects permanently to it', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'http://feeds.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'http://example.com/feed': { status: 404 },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'http://feeds.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          existsFn: (url) => {
            return url === 'http://feeds.example.com/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not retry cleaner candidates over HTTPS when a redirect target won', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'https://feeds.example.org/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'http://example.com/feed': {
              body,
              url: 'http://feeds.example.org/feed',
              redirects: [{ url: 'http://example.com/feed', status: 301 }],
            },
            'https://feeds.example.org/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTP when HTTPS returns different content', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body: '<feed>http version</feed>' },
            'https://example.com/feed': { body: '<feed>https version</feed>' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use HTTPS when HTTP redirects to it', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body, url: 'https://example.com/feed' },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should try HTTP when self URL HTTPS fails', async () => {
        const value = 'https://example.com/feed'
        const expected = 'http://example.com/rss.xml'
        const body = '<feed><link rel="self" href="feed://example.com/rss.xml"/></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'http://example.com/rss.xml': { body },
          }),
          parser: createMockParser('feed://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should try HTTPS when self URL HTTP fails', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed><link rel="self" href="http://example.com/rss.xml"/></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('http://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fall back to initialResponseUrl when both protocols fail', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed><link rel="self" href="feed://other.example.com/rss.xml"/></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('feed://other.example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use redirect destination from HTTP fallback', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed><link rel="self" href="feed://cdn.example.com/rss.xml"/></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'http://cdn.example.com/rss.xml': { body, url: 'https://example.com/rss.xml' },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('feed://cdn.example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep HTTP when HTTPS upgrade throws', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            if (url.startsWith('https://')) {
              throw new Error('SSL handshake failed')
            }
            return { status: 200, url, body, headers: new Headers() }
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('redirect handling', () => {
      it('should follow redirects and use final destination', async () => {
        const value = 'http://old-blog.example.com/rss'
        const expected = 'https://blog.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://old-blog.example.com/rss': { body, url: 'https://blog.example.com/feed' },
            'https://blog.example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep character reference text in the final destination', async () => {
        const value = 'https://example.com/rss'
        const expected = 'https://example.com/a&amp;b/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/rss': { body, url: 'https://example.com/a&amp;b/feed' },
            'https://example.com/a&amp;b/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a rewritten HTTPS redirect target that redirects temporarily to HTTP', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed/'
        const body = '<feed></feed>'
        const hostRewrite: Rewrite = {
          match: (url) => url.hostname === 'old.example.com',
          rewrite: (url) => {
            url.hostname = 'example.com'
            return url
          },
        }
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://old.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
            'https://example.com/feed/': {
              body,
              url: 'http://old.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed/', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
          rewrites: [hostRewrite],
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use the redirect target of a candidate', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://canonical.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body },
            'https://example.com/feed': { body, url: 'https://canonical.example.com/feed' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip params even when added by redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://example.com/feed?doing_wp_cron=123',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: stripWpCron,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip doing_wp_cron but keep functional params', async () => {
        const value = 'https://example.com/?feed=rss2'
        const expected = 'https://example.com/?feed=rss2'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/?feed=rss2': {
              body,
              url: 'https://example.com/?doing_wp_cron=1746970623&feed=rss2',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: stripWpCron,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip doing_wp_cron from self URL', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed?doing_wp_cron=123'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip multiple tracking params from redirect', async () => {
        const value = 'https://example.com/comments/feed/'
        const expected = 'https://example.com/comments/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/comments/feed/': {
              body,
              url: 'https://example.com/comments/feed/?doing_wp_cron=123&utm_source=rss',
            },
            'https://example.com/comments/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use redirect destination domain', async () => {
        const value = 'https://old.example.com/feed'
        const expected = 'https://new.example.org/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://old.example.com/feed': { body, url: 'https://new.example.org/feed' },
            'https://new.example.org/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject self URL redirect when content differs', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>original</feed>' },
            'https://self.example.com/feed': {
              body: '<feed>different</feed>',
              url: 'https://redirect.example.com/feed',
            },
          }),
          parser: createMockParser('https://self.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should preserve credentials added by redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://user:token@example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body, url: 'https://user:token@example.com/feed' },
            'https://user:token@example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should preserve non-standard port from redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com:8443/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body, url: 'https://example.com:8443/feed' },
            'https://example.com:8443/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip candidate that redirects back to candidateSourceUrl', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body, url: 'https://www.example.com/feed' },
            'https://www.example.com/feed': { body },
          }),
          parser: createMockParser('https://www.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should adopt destination reached through permanent redirects', async () => {
        const value = 'http://old.example.com/rss'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://old.example.com/rss': {
              body,
              url: 'https://example.com/feed',
              redirects: [
                { url: 'http://old.example.com/rss', status: 301 },
                { url: 'https://old.example.com/rss', status: 308 },
              ],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep requested URL when it redirects temporarily', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://cdn.example.net/feed?token=abc',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should adopt permanent redirect target up to first temporary redirect', async () => {
        const value = 'https://old.example.com/rss'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://old.example.com/rss': {
              body,
              url: 'https://cdn.example.net/feed?token=abc',
              redirects: [
                { url: 'https://old.example.com/rss', status: 301 },
                { url: 'https://example.com/feed', status: 302 },
              ],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep requested URL when a temporary redirect precedes a permanent one', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://feeds.example.net/feed',
              redirects: [
                { url: 'https://example.com/feed', status: 302 },
                { url: 'https://cdn.example.net/feed', status: 301 },
              ],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep requested URL when it redirects with 303', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://cdn.example.net/feed?token=abc',
              redirects: [{ url: 'https://example.com/feed', status: 303 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep candidate URL when it redirects temporarily', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://cdn.example.net/feed?token=abc',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep self URL when it redirects temporarily', async () => {
        const value = 'https://www.example.com/feed?ref=home'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed?ref=home': { body },
            'https://example.com/feed': {
              body,
              url: 'https://cdn.example.net/feed?token=abc',
              redirects: [{ url: 'https://example.com/feed', status: 307 }],
            },
          }),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('same result from every entry URL', () => {
      const body = '<feed></feed>'

      describe('non-www redirecting to www', () => {
        const entryUrls: Array<string> = [
          'https://example.com/feed',
          'https://www.example.com/feed',
        ]

        it.each(entryUrls)('should resolve %s to the www URL', async (value) => {
          const expected = 'https://www.example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://example.com/feed': {
                body,
                url: 'https://www.example.com/feed',
                redirects: [{ url: 'https://example.com/feed', status: 301 }],
              },
              'https://www.example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('www redirecting to non-www', () => {
        const entryUrls: Array<string> = [
          'https://example.com/feed',
          'https://www.example.com/feed',
        ]

        it.each(entryUrls)('should resolve %s to the non-www URL', async (value) => {
          const expected = 'https://example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://www.example.com/feed': {
                body,
                url: 'https://example.com/feed',
                redirects: [{ url: 'https://www.example.com/feed', status: 301 }],
              },
              'https://example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('http redirecting to https with a trailing slash', () => {
        const entryUrls: Array<string> = [
          'http://example.com/feed',
          'http://example.com/feed/',
          'https://example.com/feed',
          'https://example.com/feed/',
        ]

        it.each(entryUrls)('should resolve %s to the https URL with no slash', async (value) => {
          const expected = 'https://example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'http://example.com/feed': {
                body,
                url: 'https://example.com/feed/',
                redirects: [{ url: 'http://example.com/feed', status: 301 }],
              },
              'http://example.com/feed/': { body },
              'https://example.com/feed': { body },
              'https://example.com/feed/': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('http redirecting to https', () => {
        const entryUrls: Array<string> = ['http://example.com/feed', 'https://example.com/feed']

        it.each(entryUrls)('should resolve %s to the https URL', async (value) => {
          const expected = 'https://example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'http://example.com/feed': {
                body,
                url: 'https://example.com/feed',
                redirects: [{ url: 'http://example.com/feed', status: 301 }],
              },
              'https://example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('http serving the feed and https redirecting to www', () => {
        const entryUrls: Array<string> = [
          'http://example.com/feed',
          'https://example.com/feed',
          'http://www.example.com/feed',
          'https://www.example.com/feed',
        ]

        it.each(entryUrls)('should resolve %s to the https www URL', async (value) => {
          const expected = 'https://www.example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'http://example.com/feed': { body },
              'https://example.com/feed': {
                body,
                url: 'https://www.example.com/feed',
                redirects: [{ url: 'https://example.com/feed', status: 301 }],
              },
              'http://www.example.com/feed': {
                body,
                url: 'https://www.example.com/feed',
                redirects: [{ url: 'http://www.example.com/feed', status: 301 }],
              },
              'https://www.example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('https redirecting permanently to http www', () => {
        const entryUrls: Array<string> = [
          'http://example.com/feed',
          'https://example.com/feed',
          'http://www.example.com/feed',
          'https://www.example.com/feed',
        ]

        it.each(entryUrls)('should resolve %s to the https www URL', async (value) => {
          const expected = 'https://www.example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'http://example.com/feed': { body },
              'https://example.com/feed': {
                body,
                url: 'http://www.example.com/feed',
                redirects: [{ url: 'https://example.com/feed', status: 301 }],
              },
              'http://www.example.com/feed': { body },
              'https://www.example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('https redirecting permanently to http www, then temporarily to https', () => {
        const entryUrls: Array<string> = [
          'http://example.com/feed',
          'https://example.com/feed',
          'http://www.example.com/feed',
          'https://www.example.com/feed',
        ]

        it.each(entryUrls)('should resolve %s to the https www URL', async (value) => {
          const expected = 'https://www.example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'http://example.com/feed': { body },
              'https://example.com/feed': {
                body,
                url: 'https://www.example.com/feed',
                redirects: [
                  { url: 'https://example.com/feed', status: 301 },
                  { url: 'http://www.example.com/feed', status: 302 },
                ],
              },
              'http://www.example.com/feed': {
                body,
                url: 'https://www.example.com/feed',
                redirects: [{ url: 'http://www.example.com/feed', status: 302 }],
              },
              'https://www.example.com/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('self URL candidate redirecting to the URL with the trailing slash', () => {
        const entryUrls: Array<string> = ['https://example.com/feed', 'https://example.com/feed/']

        it.each(entryUrls)('should resolve %s to the URL with no slash', async (value) => {
          const expected = 'https://example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://example.com/feed': { body },
              'https://example.com/feed/': { body },
              'https://www.example.com/rss/': { body },
              'https://example.com/rss': {
                body,
                url: 'https://example.com/feed/',
                redirects: [{ url: 'https://example.com/rss', status: 301 }],
              },
            }),
            parser: createMockParser('https://www.example.com/rss/'),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('trailing slash added by a redirect', () => {
        const entryUrls: Array<string> = ['https://example.com/feed', 'https://example.com/feed/']

        it.each(entryUrls)(
          'should resolve %s to the URL with the trailing slash',
          async (value) => {
            const expected = 'https://example.com/feed/'
            const options = toOptions({
              fetchFn: createMockFetch({
                'https://example.com/feed': {
                  body,
                  url: 'https://example.com/feed/',
                  redirects: [{ url: 'https://example.com/feed', status: 301 }],
                },
                'https://example.com/feed/': { body },
              }),
              parser: createMockParser(undefined),
            })

            expect(await findCanonical(value, options)).toBe(expected)
          },
        )
      })

      describe('self URL with a query and a shorter URL redirecting to www', () => {
        const entryUrls: Array<string> = [
          'https://example.com/rss',
          'https://www.example.com/rss',
          'https://www.example.com/rss?section=/',
        ]

        it.each(entryUrls)('should resolve %s to the www URL without the query', async (value) => {
          const expected = 'https://www.example.com/rss'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://example.com/rss': {
                body,
                url: 'https://www.example.com/rss',
                redirects: [{ url: 'https://example.com/rss', status: 301 }],
              },
              'https://example.com/rss?section=/': {
                body,
                url: 'https://www.example.com/rss?section=/',
                redirects: [{ url: 'https://example.com/rss?section=/', status: 301 }],
              },
              'https://www.example.com/rss': { body },
              'https://www.example.com/rss?section=/': { body },
            }),
            parser: createMockParser('https://www.example.com/rss?section=/'),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('shorter URL redirecting to another host', () => {
        const entryUrls: Array<string> = [
          'https://example.com/feed',
          'https://www.example.com/feed',
          'https://feeds.example.org/feed',
        ]

        it.each(entryUrls)('should resolve %s to the redirect target', async (value) => {
          const expected = 'https://feeds.example.org/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://www.example.com/feed': { body },
              'https://example.com/feed': {
                body,
                url: 'https://feeds.example.org/feed',
                redirects: [{ url: 'https://example.com/feed', status: 301 }],
              },
              'https://feeds.example.org/feed': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })

      describe('https serving a shorter URL that http does not', () => {
        const entryUrls: Array<string> = [
          'http://www.example.com/feed',
          'https://www.example.com/feed',
          'https://example.com/feed',
        ]
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        it.each(entryUrls)('should resolve %s to the shorter https URL', async (value) => {
          const expected = 'https://example.com/feed'

          expect(await findCanonical(value, options)).toBe(expected)
        })

        it('should resolve its own result to the same URL', async () => {
          const value = 'http://www.example.com/feed'
          const expected = ['https://example.com/feed', 'https://example.com/feed']
          const result = await findCanonical(value, options)
          const rerunResult = await findCanonical(result as string, options)

          expect([result, rerunResult]).toEqual(expected)
        })
      })

      describe('every URL serving the feed without a redirect', () => {
        const entryUrls: Array<string> = [
          'https://example.com/feed',
          'https://example.com/feed/',
          'https://www.example.com/feed',
          'https://www.example.com/feed/',
        ]

        it.each(entryUrls)('should resolve %s to the shortest URL', async (value) => {
          const expected = 'https://example.com/feed'
          const options = toOptions({
            fetchFn: createMockFetch({
              'https://example.com/feed': { body },
              'https://example.com/feed/': { body },
              'https://www.example.com/feed': { body },
              'https://www.example.com/feed/': { body },
            }),
            parser: createMockParser(undefined),
          })

          expect(await findCanonical(value, options)).toBe(expected)
        })
      })
    })

    describe('candidate selection', () => {
      it('should clean polluted URL and upgrade to HTTPS', async () => {
        const value = 'http://www.example.com/feed/?utm_source=twitter&utm_medium=social'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed/?utm_source=twitter&utm_medium=social': { body },
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep functional query params when candidate returns different content', async () => {
        const value = 'https://example.com/feed?format=rss'
        const expected = 'https://example.com/feed?format=rss'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss': { body: '<feed>rss format</feed>' },
            'https://example.com/feed': { body: '<feed>default format</feed>' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should drop the trailing dot of a fully qualified host', async () => {
        const value = 'https://example.com./feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com./feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep character reference text in a candidate query', async () => {
        const value = 'https://example.com/rss'
        const expected = 'https://example.com/feed?a=&amp;b'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/rss': { body, url: 'https://example.com/feed?a=&amp;b' },
            'https://example.com/feed?a=&b': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should try a candidate from a tier that strips the scheme', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          tiers: [{ stripScheme: true, stripWww: true }],
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fall back to original when all candidates fail', async () => {
        const value = 'https://special.example.com:8443/api/v2/feed.json?auth=token123'
        const expected = 'https://special.example.com:8443/api/v2/feed.json?auth=token123'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://special.example.com:8443/api/v2/feed.json?auth=token123': { body },
            'https://special.example.com/api/v2/feed.json': { status: 404 },
            'https://special.example.com:8443/api/v2/feed.json': { status: 401 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject candidate when content differs', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://www.example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body: '<feed><title>Blog Feed</title></feed>' },
            'https://example.com/feed': { body: '<feed><title>Company News</title></feed>' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip default port from URL', async () => {
        const value = 'https://example.com:443/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com:443/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fall back to candidateSourceUrl when all candidates fail', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { status: 404 },
            'https://www.example.com/feed': { status: 404 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return first matching candidate when multiple match', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
            'https://www.example.com/feed': { body },
          }),
          tiers: [
            { stripWww: true, stripTrailingSlash: true },
            { stripWww: false, stripTrailingSlash: true },
          ],
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should strip tracking params from input URL when candidate works', async () => {
        const value = 'https://example.com/feed?utm_source=twitter&utm_medium=social'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?utm_source=twitter&utm_medium=social': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use initialResponseUrl when candidate matches it', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: (url: string) => {
            if (url === 'https://www.example.com/feed') {
              return { status: 200, url, body, headers: new Headers() }
            }
            throw new Error(`Unexpected fetch: ${url}`)
          },
          parser: createMockParser('https://other.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use initialResponseUrl when normalized candidate matches it', async () => {
        const value = 'http://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: (url: string) => {
            if (url === 'http://www.example.com/feed/') {
              return { status: 200, url: 'https://example.com/feed', body, headers: new Headers() }
            }
            if (url === 'https://www.example.com/feed/') {
              return { status: 200, url, body, headers: new Headers() }
            }
            throw new Error(`Unexpected fetch: ${url}`)
          },
          parser: createMockParser('https://www.example.com/feed/'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle when all tiers produce identical URL', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            fetchCalls.push(url)
            return { status: 200, url, body, headers: new Headers() }
          },
          tiers: [{ stripWww: true }, { stripWww: false }],
        })

        expect(await findCanonical(value, options)).toBe(expected)
        expect(fetchCalls).toEqual(['https://example.com/feed'])
      })

      it('should fall back to candidateSourceUrl when all candidates return different content', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const differentBody = '<feed><different/></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            if (url === 'https://www.example.com/feed/') {
              return { status: 200, url, body, headers: new Headers() }
            }
            return { status: 200, url, body: differentBody, headers: new Headers() }
          },
          tiers: [
            { stripWww: true, stripTrailingSlash: true },
            { stripWww: false, stripTrailingSlash: true },
          ],
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should prefer query-stripped URL when content matches', async () => {
        const value = 'https://example.com/feed?format=rss&v=1'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?format=rss&v=1': { body },
            'https://example.com/feed': { body },
          }),
          tiers: [
            { stripQuery: true, stripWww: true, stripTrailingSlash: true },
            { stripQuery: false, stripWww: true, stripTrailingSlash: true },
          ],
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should preserve query when stripping breaks feed', async () => {
        const value = 'https://example.com/feed?type=rss'
        const expected = 'https://example.com/feed?type=rss'
        const body = '<feed></feed>'
        const differentBody = '<html>Not a feed</html>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?type=rss': { body },
            'https://example.com/feed': { body: differentBody },
          }),
          tiers: [
            { stripQuery: true, stripWww: true, stripTrailingSlash: true },
            { stripQuery: false, stripWww: true, stripTrailingSlash: true },
          ],
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should preserve query when stripped URL returns error', async () => {
        const value = 'https://example.com/api?feed=posts'
        const expected = 'https://example.com/api?feed=posts'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: (url: string) => {
            if (url === 'https://example.com/api?feed=posts') {
              return { status: 200, url, body, headers: new Headers() }
            }
            return { status: 404, url, body: '', headers: new Headers() }
          },
          tiers: [
            { stripQuery: true, stripWww: true, stripTrailingSlash: true },
            { stripQuery: false, stripWww: true, stripTrailingSlash: true },
          ],
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep query param order when the sorted URL was not verified', async () => {
        const value = 'https://example.com/feed?b=1&a=2'
        const expected = 'https://example.com/feed?b=1&a=2'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?b=1&a=2': { body: '<feed></feed>' },
            'https://example.com/feed': { status: 404 },
            'https://example.com/feed?a=2&b=1': { status: 404 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep an empty query when the URL without it was not verified', async () => {
        const value = 'https://example.com/feed?'
        const expected = 'https://example.com/feed?'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?': { body: '<feed></feed>' },
            'https://example.com/feed': { status: 404 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return sorted query params when the sorted URL serves the same feed', async () => {
        const value = 'https://example.com/feed?b=1&a=2'
        const expected = 'https://example.com/feed?a=2&b=1'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?b=1&a=2': { body },
            'https://example.com/feed': { status: 404 },
            'https://example.com/feed?a=2&b=1': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip a candidate that redirects to the unsorted response URL', async () => {
        const value = 'https://example.com/feed?b=1&a=2'
        const expected = 'https://example.com/feed?b=1&a=2'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?b=1&a=2': { body },
            'https://example.com/feed': { body, url: 'https://example.com/feed?b=1&a=2' },
            'https://example.com/feed?a=2&b=1': { status: 404 },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('response comparison', () => {
      it('should match when bodies are exactly identical', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/rss.xml'
        const body = '<feed><title>Test</title></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com/rss.xml': { body },
          }),
          parser: createMockParser('https://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should match when signatures are identical despite different content', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/rss.xml'
        const body1 = '<feed><updated>2024-01-01T00:00:00Z</updated><title>Test</title></feed>'
        const body2 = '<feed><updated>2024-01-02T00:00:00Z</updated><title>Test</title></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: body1 },
            'https://example.com/rss.xml': { body: body2 },
          }),
          parser: {
            parse: (body) => body,
            getSelfUrl: () => 'https://example.com/rss.xml',
            getSignature: () => 'Test',
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should accept candidate when signatures match but content differs', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body1 = '<feed><cachebuster>123</cachebuster><title>Test</title></feed>'
        const body2 = '<feed><cachebuster>456</cachebuster><title>Test</title></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body: body1 },
            'https://example.com/feed': { body: body2 },
          }),
          parser: {
            parse: (body) => body,
            getSelfUrl: () => undefined,
            getSignature: () => 'Test',
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject URL when both content and signature differ', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body1 = '<feed><title>Feed A</title></feed>'
        const body2 = '<feed><title>Feed B</title></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: body1 },
            'https://example.com/other': { body: body2 },
          }),
          parser: {
            parse: (body) => body,
            getSelfUrl: () => 'https://example.com/other',
            getSignature: (feed) => (feed?.includes('Feed A') ? 'A' : 'B'),
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should match feeds when only self URL differs', async () => {
        const value = 'https://example.com/feed/'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: async (url: string) => ({
            status: 200,
            url,
            body: `self:${url}`,
            headers: new Headers(),
          }),
          parser: {
            parse: (body) => body,
            getSelfUrl: (body) => body.replace('self:', ''),
            getSignature: (body) => {
              // Neutralize self URL by replacing it with placeholder.
              const selfUrl = body.replace('self:', '')
              return JSON.stringify({ body: body.replaceAll(selfUrl, '__SELF_URL__') })
            },
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })
  })

  describe('rewrites', () => {
    it('should keep a fetched URL when its rewritten form does not serve the feed', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds2.feedburner.com/example'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: '<feed></feed>',
            url: 'https://feeds2.feedburner.com/example',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://feeds.feedburner.com/example': { status: 404 },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should return a rewritten fetched URL with its response once it serves the same feed', async () => {
      const value = 'https://example.com/feed'
      const expected = {
        url: 'https://feeds.feedburner.com/example',
        responseUrl: 'https://feeds.feedburner.com/example',
      }
      const body = '<feed></feed>'
      let canonicalData: { url: string; responseUrl?: string } | undefined
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body,
            url: 'https://feeds2.feedburner.com/example',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://feeds.feedburner.com/example': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
        onCanonical: ({ url, response }) => {
          canonicalData = { url, responseUrl: response?.url }
        },
      })

      await findCanonical(value, options)

      expect(canonicalData).toEqual(expected)
    })

    it('should use the permanent redirect target of a rewritten fetched URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.org/feed'
      const body = '<feed></feed>'
      const hostRewrite: Rewrite = {
        match: (url) => url.hostname === 'old.example.com',
        rewrite: (url) => {
          url.hostname = 'new.example.com'
          return url
        },
      }
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body,
            url: 'https://old.example.com/feed',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://new.example.com/feed': {
            body,
            url: 'https://example.org/feed',
            redirects: [{ url: 'https://new.example.com/feed', status: 301 }],
          },
        }),
        parser: createMockParser(undefined),
        rewrites: [hostRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should keep a rewritten URL that redirects permanently back to a URL the rewrite matches', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://new.example.com/feed'
      const body = '<feed></feed>'
      const hostRewrite: Rewrite = {
        match: (url) => url.hostname === 'old.example.com',
        rewrite: (url) => {
          url.hostname = 'new.example.com'
          return url
        },
      }
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body,
            url: 'https://old.example.com/feed',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://new.example.com/feed': {
            body,
            url: 'https://old.example.com/feed',
            redirects: [{ url: 'https://new.example.com/feed', status: 301 }],
          },
        }),
        parser: createMockParser(undefined),
        rewrites: [hostRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should not move the permanent redirect target of a rewritten fetched URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://www.example.com/feed'
      const body = '<feed></feed>'
      const hostRewrite: Rewrite = {
        match: (url) => url.hostname === 'old.example.com',
        rewrite: (url) => {
          url.hostname = 'new.example.com'
          return url
        },
      }
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body,
            url: 'https://old.example.com/feed',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://new.example.com/feed': {
            body,
            url: 'https://www.example.com/feed',
            redirects: [{ url: 'https://new.example.com/feed', status: 301 }],
          },
          'https://moved.example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [hostRewrite],
        tiers: [],
        cleanUrlFn: (url) => {
          return url.replace('https://www.example.com/', 'https://moved.example.com/')
        },
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should resolve an http www Blogspot URL to the https URL without www', async () => {
      const value = 'http://www.example.blogspot.com/feeds/posts/default'
      const expected = 'https://example.blogspot.com/feeds/posts/default'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.blogspot.com/feeds/posts/default': { body: '<feed></feed>' },
        }),
        parser: createMockParser(undefined),
        rewrites: [bloggerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should normalize FeedBurner aliases to canonical domain', async () => {
      const value = 'https://feedproxy.google.com/ExampleNews?format=xml'
      const expected = 'https://feeds.feedburner.com/ExampleNews'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/ExampleNews?format=xml': { body },
          'https://feeds.feedburner.com/ExampleNews': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should normalize different FeedBurner aliases to same canonical domain', async () => {
      const expected = 'https://feeds.feedburner.com/blog'
      const body = '<feed></feed>'

      const optionsA = toOptions({
        fetchFn: createMockFetch({
          'https://feeds2.feedburner.com/blog': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })
      const optionsB = toOptions({
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/blog?format=rss': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })
      const optionsC = toOptions({
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/blog?format=xml': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical('https://feeds2.feedburner.com/blog', optionsA)).toBe(expected)
      expect(await findCanonical('https://feedproxy.google.com/blog?format=rss', optionsB)).toBe(
        expected,
      )
      expect(await findCanonical('https://feeds.feedburner.com/blog?format=xml', optionsC)).toBe(
        expected,
      )
    })

    it('should return undefined when platform canonical is dead', async () => {
      const value = 'https://feedproxy.google.com/MyBlog'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/MyBlog': { status: 404 },
        }),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should apply rewrite when response redirects to FeedBurner', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body, url: 'https://feedproxy.google.com/ExampleBlog' },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should apply rewrite to FeedBurner self URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser('https://feedproxy.google.com/ExampleBlog'),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should apply rewrite to self URL redirect destination', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://old.example.com/rss': { body, url: 'https://feedproxy.google.com/ExampleBlog' },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser('https://old.example.com/rss'),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should continue gracefully when rewrite throws', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const throwingRewrite: Rewrite = {
        match: () => {
          throw new Error('Rewrite error')
        },
        rewrite: (url) => url,
      }
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        rewrites: [throwingRewrite],
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should apply only first matching rewrite', async () => {
      const value = 'https://multi.example.com/feed'
      const expected = 'https://first.example.com/feed'
      const body = '<feed></feed>'
      const firstRewrite: Rewrite = {
        match: (url) => url.hostname === 'multi.example.com',
        rewrite: (url) => {
          url.hostname = 'first.example.com'
          return url
        },
      }
      const secondRewrite: Rewrite = {
        match: (url) => url.hostname === 'multi.example.com',
        rewrite: (url) => {
          url.hostname = 'second.example.com'
          return url
        },
      }
      const options = toOptions({
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://first.example.com/feed': { body },
        }),
        rewrites: [firstRewrite, secondRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should apply rewrite to generated candidates', async () => {
      const value = 'https://feeds2.feedburner.com/Example?format=xml'
      const expected = 'https://feeds.feedburner.com/Example'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://feeds2.feedburner.com/Example?format=xml': { body },
          'https://feeds.feedburner.com/Example': { body },
        }),
        parser: createMockParser(undefined),
        rewrites: [feedburnerRewrite],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should return undefined when response URL is invalid after rewrite', async () => {
      const value = 'https://example.com/feed'
      const badRewrite: Rewrite = {
        match: () => true,
        rewrite: () => {
          return new URL('file:///invalid')
        },
      }
      const options = toOptions({
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed/>' },
        }),
        rewrites: [badRewrite],
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })
  })

  describe('options', () => {
    describe('existsFn', () => {
      it('should return matching URL when existsFn finds match', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not match a known URL decoded from character reference text', async () => {
        const value = 'https://example.com/rss'
        const expected = 'https://example.com/a&amp;b/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/rss': { body, url: 'https://example.com/a&amp;b/feed' },
          }),
          existsFn: (url) => (url === 'https://example.com/a&b/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should check candidates in tier order after the response URL', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = [
          'https://www.example.com/feed/',
          'http://www.example.com/feed/',
          'https://example.com/feed',
          'http://example.com/feed',
          'https://www.example.com/feed',
          'http://www.example.com/feed',
        ]
        const body = '<feed></feed>'
        const checkedUrls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: (url) => {
            checkedUrls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(checkedUrls).toEqual(expected)
      })

      it('should continue testing when existsFn returns false', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: () => undefined,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return non-first candidate when existsFn matches it', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const checkedUrls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://www.example.com/feed': { body },
          }),
          existsFn: (url) => {
            checkedUrls.push(url)
            return url === 'https://www.example.com/feed' ? { id: 99 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
        expect(checkedUrls).toContain('https://example.com/feed')
        expect(checkedUrls).toContain('https://www.example.com/feed')
      })

      it('should treat null from existsFn as not found', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: () => null,
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should treat falsy-but-defined existsFn results as "exists"', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? 0 : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return undefined when existsFn throws', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: () => {
            throw new Error('DB connection failed')
          },
          parser: createMockParser(undefined),
        })
        expect(await findCanonical(value, options)).toBeUndefined()
      })

      it('should skip existing URL without query when it serves a different feed', async () => {
        const value = 'https://example.com/feed.php?cat=1'
        const expected = 'https://example.com/feed.php?cat=1'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed.php?cat=1': { body: '<feed>category</feed>' },
            'https://example.com/feed.php': { body: '<feed>all</feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed.php' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing URL without query when it serves the same feed', async () => {
        const value = 'https://example.com/feed.php?utm_source=rss'
        const expected = 'https://example.com/feed.php'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed.php?utm_source=rss': { body },
            'https://example.com/feed.php': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed.php' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing URL without query when the feed came through a temporary redirect', async () => {
        const value = 'https://example.com/podcast?show=1'
        const expected = 'https://example.com/podcast'
        const createBody = (date: string) => `
          <?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <title>Podcast</title>
              <link>https://example.com</link>
              <lastBuildDate>${date}</lastBuildDate>
              <item>
                <title>Episode</title>
                <guid>episode-1</guid>
                <enclosure url="https://media.example.net/episode-1.mp3" type="audio/mpeg"/>
              </item>
            </channel>
          </rss>
        `
        const fetchFn = createMockFetch({
          'https://example.com/podcast?show=1': {
            body: createBody('Mon, 01 Jan 2024 00:00:00 GMT'),
            url: 'https://media.example.net/feed.xml',
            redirects: [{ url: 'https://example.com/podcast?show=1', status: 302 }],
          },
          'https://example.com/podcast': {
            body: createBody('Tue, 02 Jan 2024 00:00:00 GMT'),
            url: 'https://media.example.net/feed.xml',
            redirects: [{ url: 'https://example.com/podcast', status: 302 }],
          },
        })
        const existsFn = (url: string) => {
          return url === 'https://example.com/podcast' ? { id: 42 } : undefined
        }

        expect(await findCanonical(value, { fetchFn, existsFn })).toBe(expected)
      })

      it('should return existing http URL for https input', async () => {
        const value = 'https://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'http://example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'http://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fetch https candidate when only its http form is known and serves a different feed', async () => {
        const value = 'https://example.com/feed?cat=1'
        const expected = 'https://example.com/feed'
        const body = '<feed>category</feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?cat=1': { body },
            'https://example.com/feed': { body },
            'http://example.com/feed': { body: '<feed>all</feed>' },
          }),
          existsFn: (url) => (url === 'http://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should prefer existing https URL over its http form', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          existsFn: () => ({ id: 42 }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not return existing https URL for http input when https fails', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { status: 503 },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing https URL for http input when https serves the feed', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing https URL over its permanent redirect target', async () => {
        const value = 'http://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a known final URL of a temporary redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://feeds.example.org/blog'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body: '<feed></feed>',
              url: 'https://feeds.example.org/blog',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          existsFn: (url) => (url === 'https://feeds.example.org/blog' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a known https form of the http final URL of a temporary redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://feeds.example.org/blog'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'http://feeds.example.org/blog',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
            'https://feeds.example.org/blog': { body },
          }),
          existsFn: (url) => (url === 'https://feeds.example.org/blog' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a known final URL of a temporary redirect with its query cleaned', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://feeds.example.org/blog'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body: '<feed></feed>',
              url: 'https://feeds.example.org/blog?doing_wp_cron=123',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          existsFn: (url) => (url === 'https://feeds.example.org/blog' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
          cleanUrlFn: stripWpCron,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return the known requested URL over the known final URL of a temporary redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body: '<feed></feed>',
              url: 'https://feeds.example.org/blog',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          existsFn: () => ({ id: 42 }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch a known final URL of a temporary redirect again', async () => {
        const value = 'https://example.com/feed'
        const expected = ['https://example.com/feed']
        const fetchCalls: Array<string> = []
        const mockFetch = createMockFetch({
          'https://example.com/feed': {
            body: '<feed></feed>',
            url: 'https://feeds.example.org/blog',
            redirects: [{ url: 'https://example.com/feed', status: 302 }],
          },
        })
        const options = toOptions({
          fetchFn: (url) => {
            fetchCalls.push(url)
            return mockFetch(url)
          },
          existsFn: (url) => (url === 'https://feeds.example.org/blog' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should look up each URL in existsFn once', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const lookups: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'http://example.com/feed': {
              body,
              url: 'https://example.com/feed',
              redirects: [{ url: 'http://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => {
            lookups.push(url)
          },
          parser: createMockParser('http://example.com/feed'),
        })
        const expected = ['https://example.com/feed', 'http://example.com/feed']

        await findCanonical(value, options)

        expect(lookups).toEqual(expected)
      })

      it('should return a known candidate that redirects permanently to its https form', async () => {
        const value = 'http://www.example.com/feed/'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed/': { body },
            'http://example.com/feed': {
              body,
              url: 'https://example.com/feed',
              redirects: [{ url: 'http://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'http://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return the target of a known candidate that redirects permanently', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': {
              body,
              url: 'https://example.com/feed.xml',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should prefer existing http URL over its https form', async () => {
        const value = 'http://example.com/feed'
        const expected = 'http://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
          }),
          existsFn: () => ({ id: 42 }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing URL when a candidate redirects to a known URL', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'http://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body },
            'http://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'http://www.example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return existing URL when a candidate redirects to a new URL', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'http://feeds.example.org/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body },
            'http://feeds.example.org/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://feeds.example.org/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          existsFn: (url) => (url === 'http://feeds.example.org/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a known candidate that matched earlier in the call', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body, url: 'ftp://example.com/feed' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch a known candidate again when it matched earlier in the call', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = ['https://www.example.com/feed/', 'https://example.com/feed']
        const fetchCalls: Array<string> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body, url: 'ftp://example.com/feed' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser('https://example.com/feed'),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should skip a known candidate that served a different feed earlier in the call', async () => {
        const value = 'https://example.com/feed?id=1'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?id=1': { body: '<feed>category</feed>' },
            'https://example.com/feed': { body: '<feed>all</feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(value)
      })

      it('should skip a known candidate that fails to fetch and continue', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { status: 404 },
            'https://www.example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip a known https form of the response URL when it serves a different feed', async () => {
        const value = 'http://www.example.com/feed'
        const expected = 'http://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body: '<feed>blog</feed>' },
            'http://example.com/feed': { body: '<feed>blog</feed>' },
            'https://www.example.com/feed': { body: '<feed>shop</feed>' },
          }),
          existsFn: (url) => (url === 'https://www.example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip a known http form of a self URL that served a different feed', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>blog</feed>' },
            'http://www.example.com/feed/': { body: '<feed>shop</feed>' },
            'https://www.example.com/feed/': { body: '<feed>blog</feed>' },
          }),
          existsFn: (url) => (url === 'http://www.example.com/feed/' ? { id: 42 } : undefined),
          parser: createMockParser('http://www.example.com/feed/'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch a known http form again when it served a different feed', async () => {
        const value = 'https://example.com/feed'
        const expected = [
          'https://example.com/feed',
          'http://www.example.com/feed/',
          'https://www.example.com/feed/',
        ]
        const fetchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>blog</feed>' },
            'http://www.example.com/feed/': { body: '<feed>shop</feed>' },
            'https://www.example.com/feed/': { body: '<feed>blog</feed>' },
          }),
          existsFn: (url) => (url === 'http://www.example.com/feed/' ? { id: 42 } : undefined),
          parser: createMockParser('http://www.example.com/feed/'),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should skip a known https form of a redirect target when it serves a different feed', async () => {
        const value = 'http://www.example.com/feed?id=1'
        const expected = 'http://example.com/other'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://www.example.com/feed?id=1': { body: '<feed>blog</feed>' },
            'http://example.com/feed': {
              body: '<feed>blog</feed>',
              url: 'http://example.com/other',
              redirects: [{ url: 'http://example.com/feed', status: 301 }],
            },
            'https://example.com/other': { body: '<feed>shop</feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/other' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip a known https form of a cleaned URL when it serves a different feed', async () => {
        const value = 'http://example.com/go/feed'
        const expected = 'http://example.com/go/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/go/feed': { body: '<feed>blog</feed>' },
            'https://example.com/feed': { body: '<feed>shop</feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
          cleanUrlFn: (url) => url.replace('/go/feed', '/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not return a known https form that failed to fetch earlier', async () => {
        const value = 'feed://example.com/feed'
        const expected = 'http://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { status: 503 },
            'http://example.com/feed': { body: '<feed></feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch a known https form again when it failed to fetch earlier', async () => {
        const value = 'feed://example.com/feed'
        const expected = ['https://example.com/feed', 'http://example.com/feed']
        const fetchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { status: 503 },
            'http://example.com/feed': { body: '<feed></feed>' },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })
    })

    describe('parser', () => {
      it('should skip a candidate whose signature throws and continue', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body: '<feed> </feed>' },
            'https://www.example.com/feed': { body },
          }),
          parser: {
            parse: (body) => body,
            getSelfUrl: () => undefined,
            getSignature: (_feed, url) => {
              if (url === 'https://example.com/feed') {
                throw new Error('Signature failed')
              }

              return 'signature'
            },
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use selfUrl as candidate source when valid', async () => {
        const value = 'https://cdn.example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://cdn.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should await async parser on initial parse', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        let parseCompleted = false
        const asyncParser: ParserAdapter<string> = {
          parse: async (body) => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            parseCompleted = true
            return body
          },
          getSelfUrl: () => undefined,
          getSignature: (parsed) => parsed,
        }
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: asyncParser,
        })

        const result = await findCanonical(value, options)
        expect(parseCompleted).toBe(true)
        expect(result).toBe(expected)
      })

      it('should await async parser during signature comparison', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://example.com/feed'
        let comparisonParseCount = 0
        const asyncParser: ParserAdapter<{ id: string }> = {
          parse: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            comparisonParseCount++
            return { id: 'same-feed' }
          },
          getSelfUrl: () => undefined,
          getSignature: (parsed) => JSON.stringify(parsed),
        }
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed': { body: '<feed>a</feed>' },
            'https://example.com/feed': { body: '<feed>b</feed>' },
          }),
          parser: asyncParser,
        })

        const result = await findCanonical(value, options)
        expect(comparisonParseCount).toBeGreaterThan(1)
        expect(result).toBe(expected)
      })
    })

    describe('onFetch', () => {
      it('should call onFetch for initial fetch', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<{ url: string; status: number }> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onFetch: ({ url, response }) => {
            fetchCalls.push({ url, status: response.status })
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual([{ url: 'https://example.com/feed', status: 200 }])
      })

      it('should call onFetch for each candidate attempt', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(['https://www.example.com/feed/', 'https://example.com/feed'])
      })

      it('should fetch a URL tried in two phases only once', async () => {
        const value = 'http://example.com/feed?source=home'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser('https://example.com/feed'),
          fetchFn: (url: string) => {
            fetchCalls.push(url)

            if (url.startsWith('https://')) {
              throw new Error('SSL handshake failed')
            }

            return { status: 200, url, body, headers: new Headers() }
          },
        })
        const expected = [
          'http://example.com/feed?source=home',
          'https://example.com/feed',
          'http://example.com/feed',
        ]

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should not fetch the entry URL again when it is a tier candidate', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
            'https://example.com/feed/': { body },
          }),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(['https://example.com/feed'])
      })

      it('should not fetch the entry URL again when it is the self URL', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser('https://example.com/feed'),
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body,
              url: 'https://example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
            'https://example.com/feed/': { body },
          }),
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(['https://example.com/feed'])
      })

      it('should call onFetch for both attempts of feed:// input URL', async () => {
        const value = 'feed://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<{ url: string; status: number }> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { status: 404 },
            'http://example.com/feed': { body },
          }),
          onFetch: ({ url, response }) => {
            fetchCalls.push({ url, status: response.status })
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual([
          { url: 'https://example.com/feed', status: 404 },
          { url: 'http://example.com/feed', status: 200 },
        ])
      })

      it('should call onFetch for failed requests', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const fetchCalls: Array<{ url: string; status: number }> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body: '', status: 404 },
          }),
          onFetch: ({ url, response }) => {
            fetchCalls.push({ url, status: response.status })
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual([
          { url: 'https://www.example.com/feed/', status: 200 },
          { url: 'https://example.com/feed', status: 404 },
        ])
      })

      it('should return undefined when onFetch throws', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onFetch: () => {
            throw new Error('Callback error')
          },
        })
        expect(await findCanonical(value, options)).toBeUndefined()
      })
    })

    describe('onMatch', () => {
      it('should call onMatch for initial response', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const matchCalls: Array<{ url: string; body: string }> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onMatch: ({ url, response }) => {
            matchCalls.push({ url, body: response.body })
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual([{ url: 'https://example.com/feed', body }])
      })

      it('should not call onMatch when parsing fails', async () => {
        const value = 'https://example.com/feed'
        const matchCalls: Array<string> = []
        const options = toOptions({
          parser: {
            parse: () => undefined,
            getSelfUrl: () => undefined,
            getSignature: () => 'Test',
          },
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: 'not a valid feed' },
          }),
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        const result = await findCanonical(value, options)

        expect(result).toBeUndefined()
        expect(matchCalls).toEqual([])
      })

      it('should call onMatch for self URL validation', async () => {
        const value = 'https://cdn.example.com/feed'
        const body = '<feed></feed>'
        const matchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://cdn.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed'),
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(['https://cdn.example.com/feed', 'https://example.com/feed'])
      })

      it('should call onMatch for candidate match', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const matchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(['https://www.example.com/feed/', 'https://example.com/feed'])
      })

      it('should call onMatch for HTTPS upgrade', async () => {
        const value = 'http://example.com/feed'
        const body = '<feed></feed>'
        const matchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(['http://example.com/feed', 'https://example.com/feed'])
      })

      it('should call onMatch once for a URL a later phase reaches again', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const matchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser('https://example.com/?feed=rss2'),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com/?feed=rss2': { body },
          }),
          probes: [wordpressProbe],
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(['https://example.com/feed', 'https://example.com/?feed=rss2'])
      })

      it('should include full response and feed in onMatch', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        let matchData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onMatch: (data) => {
            matchData = data
          },
        })

        await findCanonical(value, options)

        expect(matchData).toEqual({
          url: value,
          response: { body, url: value, status: 200, headers: new Headers() },
          feed: body,
        })
      })

      it('should return undefined when onMatch throws', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onMatch: () => {
            throw new Error('Callback error')
          },
        })
        expect(await findCanonical(value, options)).toBeUndefined()
      })
    })

    describe('onExists', () => {
      it('should call onExists for a known final URL of a temporary redirect', async () => {
        const value = 'https://example.com/feed'
        const expected = [{ url: 'https://feeds.example.org/blog', data: { id: 42 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body: '<feed></feed>',
              url: 'https://feeds.example.org/blog',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          existsFn: (url) => (url === 'https://feeds.example.org/blog' ? { id: 42 } : undefined),
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
          parser: createMockParser(undefined),
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should call onExists when existsFn finds match with data', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const existingData = { id: 123, savedAt: '2024-01-01' }
        let existsCallData: { url: string; data: unknown } | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => {
            if (url === 'https://example.com/feed') {
              return existingData
            }
          },
          onExists: ({ url, data }) => {
            existsCallData = { url, data }
          },
        })

        await findCanonical(value, options)

        expect(existsCallData).toEqual({ url: 'https://example.com/feed', data: existingData })
      })

      it('should call onExists for a stored http URL a cleaner HTTPS candidate redirects to', async () => {
        const value = 'http://www.example.com/feed'
        const expected = [{ url: 'http://example.org/feed', data: { id: 1 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'http://www.example.com/feed': { body },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': { body, url: 'http://example.org/feed' },
          }),
          existsFn: (url) => {
            return url === 'http://example.org/feed' ? { id: 1 } : undefined
          },
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should return undefined when onExists throws', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => (url === 'https://example.com/feed' ? { id: 55 } : undefined),
          onExists: () => {
            throw new Error('Callback error')
          },
        })
        expect(await findCanonical(value, options)).toBeUndefined()
      })
    })

    describe('onCanonical', () => {
      it('should call onCanonical once with the returned URL', async () => {
        const value = 'http://www.example.com/feed/'
        const body = '<feed></feed>'
        const canonicalCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'http://www.example.com/feed/': { body },
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          onCanonical: ({ url }) => {
            canonicalCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(canonicalCalls).toEqual(['https://example.com/feed'])
      })

      it('should pass the initial response when the initial URL is returned', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the candidate response when a cleaner tier candidate is returned', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the self URL response when the self URL is returned', async () => {
        const value = 'https://cdn.example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser('https://example.com/feed'),
          fetchFn: createMockFetch({
            'https://cdn.example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the initial response when a self URL lands on a non-http URL', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser('https://www.example.com/feed'),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://www.example.com/feed': { body, url: 'ftp://example.com/feed' },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the cleaned URL response when a self URL lands on a non-http URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser('https://www.example.com/feed'),
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': { body },
            'https://www.example.com/feed': { body, url: 'ftp://example.com/feed' },
          }),
          cleanUrlFn: (url) => url.replace('https://track.example.org/click?url=', ''),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the redirect response when a candidate redirects permanently', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const redirects = [{ url: 'https://example.com/feed', status: 301 }]
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': {
              body,
              url: 'https://example.com/rss',
              redirects,
            },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/rss',
          response: {
            body,
            url: 'https://example.com/rss',
            status: 200,
            headers: new Headers(),
            redirects,
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the HTTPS response when the HTTPS upgrade is returned', async () => {
        const value = 'http://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the returned URL response when onMatch last reported another URL', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser('https://example.com/?feed=rss2'),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com/?feed=rss2': { body },
          }),
          probes: [wordpressProbe],
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the response of a verified other protocol form existsFn knows', async () => {
        const value = 'http://example.com/feed'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'http://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should pass the verifying response for a tier candidate existsFn knows', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        let canonicalData: unknown | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
          onCanonical: (data) => {
            canonicalData = data
          },
        })
        const expected = {
          url: 'https://example.com/feed',
          response: {
            body,
            url: 'https://example.com/feed',
            status: 200,
            headers: new Headers(),
          },
          feed: body,
        }

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should not call onCanonical when no URL is returned', async () => {
        const value = 'https://example.com/feed'
        const canonicalCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { status: 404 },
          }),
          onCanonical: ({ url }) => {
            canonicalCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(canonicalCalls).toEqual([])
      })

      it('should return undefined when onCanonical throws', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          onCanonical: () => {
            throw new Error('Callback error')
          },
        })

        expect(await findCanonical(value, options)).toBeUndefined()
      })
    })

    describe('cleanUrlFn', () => {
      // Stand-in for an unwrapping cleaner: returns the URL a click tracker carries in `url`.
      const unwrapTracker = (url: string): string => {
        return new URL(url).searchParams.get('url') ?? url
      }

      it('should not fetch again when cleaning only changes the query', async () => {
        const value = 'https://example.com/feed?doing_wp_cron=123'
        const expected = ['https://example.com/feed?doing_wp_cron=123']
        const fetchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed?doing_wp_cron=123': { body: '<feed></feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: stripWpCron,
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should keep the response URL when its cleaned form served a different feed', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed?doing_wp_cron=123'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body: '<feed>blog</feed>' },
            'https://example.com/feed': { body: '<feed>shop</feed>' },
            'https://www.example.com/feed': {
              body: '<feed>blog</feed>',
              url: 'https://example.com/feed?doing_wp_cron=123',
              redirects: [{ url: 'https://www.example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: stripWpCron,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use an unwrapped URL when it serves the same feed', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should report a verified unwrapped URL through onMatch', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [
          'https://track.example.org/click?url=https://example.com/feed',
          'https://example.com/feed',
        ]
        const matchCalls: Array<string> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(expected)
      })

      it('should use the permanent redirect target of an unwrapped URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should clean the query of the permanent redirect target of an unwrapped URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/?doing_wp_cron=123',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: (url) => {
            return stripWpCron(unwrapTracker(url))
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not unwrap the permanent redirect target of an unwrapped URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://www.example.com/feed/?url=https://other.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/?url=https://other.example.com/feed',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
            'https://other.example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not fetch the unwrapped form of a permanent redirect target', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [
          'https://track.example.org/click?url=https://example.com/feed',
          'https://example.com/feed',
        ]
        const fetchCalls: Array<string> = []
        const body = '<feed></feed>'
        const mockFetch = createMockFetch({
          'https://track.example.org/click?url=https://example.com/feed': { body },
          'https://example.com/feed': {
            body,
            url: 'https://www.example.com/feed/?url=https://other.example.com/feed',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
          'https://other.example.com/feed': { body },
        })
        const options = toOptions({
          fetchFn: (url) => {
            fetchCalls.push(url)
            return mockFetch(url)
          },
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should pass the response of an unwrapped URL with its redirect target to onCanonical', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = {
          url: 'https://www.example.com/feed/',
          responseUrl: 'https://www.example.com/feed/',
        }
        const body = '<feed></feed>'
        let canonicalData: { url: string; responseUrl?: string } | undefined
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          onCanonical: ({ url, response }) => {
            canonicalData = { url, responseUrl: response?.url }
          },
        })

        await findCanonical(value, options)

        expect(canonicalData).toEqual(expected)
      })

      it('should report an unwrapped URL that redirects permanently once through onMatch', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [
          'https://track.example.org/click?url=https://example.com/feed',
          'https://example.com/feed',
        ]
        const matchCalls: Array<string> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 301 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          onMatch: ({ url }) => {
            matchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(matchCalls).toEqual(expected)
      })

      it('should keep an unwrapped URL that redirects temporarily', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://www.example.com/feed/',
              redirects: [{ url: 'https://example.com/feed', status: 302 }],
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep the response URL when the unwrapped URL serves a different feed', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
            },
            'https://example.com/feed': { body: '<feed>blog</feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should keep the response URL when existsFn returns null for the unwrapped URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
            },
            'https://example.com/feed': { body: '<feed>blog</feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: () => null,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not return an unwrapped URL that existsFn knows when it serves a different feed', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
            },
            'https://example.com/feed': { body: '<feed>blog</feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should not return an unwrapped URL that existsFn knows when it fails to fetch', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed></feed>',
            },
            'https://example.com/feed': { status: 404 },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should fetch an unwrapped URL that existsFn knows once', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [
          'https://track.example.org/click?url=https://example.com/feed',
          'https://example.com/feed',
        ]
        const fetchCalls: Array<string> = []
        const mockFetch = createMockFetch({
          'https://track.example.org/click?url=https://example.com/feed': {
            body: '<feed></feed>',
          },
          'https://example.com/feed': { body: '<feed></feed>' },
        })
        const options = toOptions({
          fetchFn: (url) => {
            fetchCalls.push(url)
            return mockFetch(url)
          },
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should return an unwrapped URL that existsFn knows over a valid self URL', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/rss': { body },
          }),
          parser: createMockParser('https://example.com/rss'),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should call onExists once for an unwrapped URL that existsFn knows', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [{ url: 'https://example.com/feed', data: { id: 1 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/rss': { body },
          }),
          parser: createMockParser('https://example.com/rss'),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should return the stored https form of an unwrapped http URL', async () => {
        const value = 'https://track.example.org/click?url=http://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'http://example.com/feed': { body: '<feed></feed>' },
            'https://track.example.org/click?url=http://example.com/feed': {
              body: '<feed></feed>',
            },
            'https://example.com/feed': { body: '<feed></feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return a response URL that existsFn knows when the unwrapped URL serves a different feed', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
            },
            'https://example.com/feed': { body: '<feed>blog</feed>' },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://track.example.org/click?url=https://example.com/feed'
              ? { id: 1 }
              : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(value)
      })

      it('should not fetch a self URL after an unwrapped URL that existsFn knows', async () => {
        const value = 'https://track.example.org/click?url=https://example.com/feed'
        const expected = [
          'https://track.example.org/click?url=https://example.com/feed',
          'https://example.com/feed',
        ]
        const fetchCalls: Array<string> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://track.example.org/click?url=https://example.com/feed': { body },
            'https://example.com/rss': { body },
          }),
          parser: createMockParser('https://example.com/rss'),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/feed' ? { id: 1 } : undefined
          },
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should return an unwrapped self URL target that existsFn knows', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://www.example.com/blog/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/blog/feed': { body },
            'https://example.com/feed': { body },
            'https://example.com/rss': {
              body,
              url: 'https://track.example.org/click?url=https://www.example.com/blog/feed',
            },
            'https://example.com/blog/feed': { body },
          }),
          parser: createMockParser('https://example.com/rss'),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://www.example.com/blog/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should call onExists once for an unwrapped self URL target that existsFn knows', async () => {
        const value = 'https://example.com/feed'
        const expected = [{ url: 'https://www.example.com/blog/feed', data: { id: 1 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/blog/feed': { body },
            'https://example.com/feed': { body },
            'https://example.com/rss': {
              body,
              url: 'https://track.example.org/click?url=https://www.example.com/blog/feed',
            },
          }),
          parser: createMockParser('https://example.com/rss'),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://www.example.com/blog/feed' ? { id: 1 } : undefined
          },
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should return an unwrapped probe target that existsFn knows', async () => {
        const value = 'https://example.com/?feed=rss2'
        const expected = 'https://www.example.com/blog/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/blog/feed': { body },
            'https://example.com/?feed=rss2': { body },
            'https://example.com/feed': {
              body,
              url: 'https://track.example.org/click?url=https://www.example.com/blog/feed',
            },
            'https://example.com/blog/feed': { body },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          probes: [
            {
              match: (url) => url.searchParams.has('feed'),
              getCandidates: () => ['https://example.com/feed'],
            },
          ],
          existsFn: (url) => {
            return url === 'https://www.example.com/blog/feed' ? { id: 1 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should call onExists once for an unwrapped candidate target that existsFn knows', async () => {
        const value = 'https://www.example.com/feed'
        const expected = [{ url: 'https://example.com/blog/feed', data: { id: 1 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/blog/feed': { body },
            'https://www.example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://track.example.org/click?url=https://example.com/blog/feed',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/blog/feed' ? { id: 1 } : undefined
          },
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should call onExists once for an unwrapped HTTPS upgrade target that existsFn knows', async () => {
        const value = 'http://example.com/feed'
        const expected = [{ url: 'https://example.com/blog/feed', data: { id: 1 } }]
        const existsCalls: Array<{ url: string; data: unknown }> = []
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/blog/feed': { body },
            'http://example.com/feed': { body },
            'https://example.com/feed': {
              body,
              url: 'https://track.example.org/click?url=https://example.com/blog/feed',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          existsFn: (url) => {
            return url === 'https://example.com/blog/feed' ? { id: 1 } : undefined
          },
          onExists: ({ url, data }) => {
            existsCalls.push({ url, data })
          },
        })

        await findCanonical(value, options)

        expect(existsCalls).toEqual(expected)
      })

      it('should not fetch an unwrapped URL that was the requested URL', async () => {
        const value = 'https://example.com/feed'
        const expected = ['https://example.com/feed']
        const fetchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': {
              body: '<feed></feed>',
              url: 'https://track.example.org/click?url=https://example.com/feed',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
          onFetch: ({ url }) => {
            fetchCalls.push(url)
          },
        })

        await findCanonical(value, options)

        expect(fetchCalls).toEqual(expected)
      })

      it('should skip a candidate that redirects back to a response URL kept unwrapped', async () => {
        const value = 'https://www.track.example.org/click?url=https://example.com/feed'
        const expected = 'https://www.track.example.org/click?url=https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
            },
            'https://example.com/feed': { body: '<feed>blog</feed>' },
            'https://track.example.org/click?url=https://example.com/feed': {
              body: '<feed>newsletter</feed>',
              url: 'https://www.track.example.org/click?url=https://example.com/feed',
            },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: unwrapTracker,
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return undefined when cleanUrlFn throws', async () => {
        const value = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
          cleanUrlFn: () => {
            throw new Error('Cleaner failed')
          },
        })
        expect(await findCanonical(value, options)).toBeUndefined()
      })
    })

    describe('defaults', () => {
      const fetchSpy = spyOn(globalThis, 'fetch')

      afterAll(() => {
        fetchSpy.mockRestore()
      })

      it('should use defaultParser and defaultFetch when options are omitted', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = `
          <?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <title>Example</title>
              <link>https://example.com</link>
            </channel>
          </rss>
        `
        // @ts-expect-error: This is for testing purposes.
        fetchSpy.mockImplementation((url: string) => {
          const response = new Response(body)
          Object.defineProperty(response, 'url', { value: url })
          return response
        })

        expect(await findCanonical(value)).toBe(expected)
      })
    })
  })

  describe('error handling', () => {
    it('should return undefined when fetch throws', async () => {
      const value = 'https://example.com/feed.xml'
      const options = toOptions({
        parser: createMockParser(undefined),
        fetchFn: () => {
          throw new Error('Network error')
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should return undefined when fetch returns non-2xx', async () => {
      const value = 'https://example.com/feed.xml'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should return undefined when fetch fails due to redirect loop', async () => {
      const value = 'https://example.com/feed'
      const options = toOptions({
        parser: createMockParser(undefined),
        fetchFn: () => {
          throw new Error('Redirect loop detected')
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should return undefined when parser returns undefined', async () => {
      const value = 'https://example.com/feed'
      const body = '<invalid>not a feed</invalid>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: {
          parse: () => undefined,
          getSelfUrl: () => undefined,
          getSignature: () => 'Test',
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should return undefined when parser throws', async () => {
      const value = 'https://example.com/feed'
      const body = '<invalid>not a feed</invalid>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: {
          parse: () => {
            throw new Error('Malformed feed')
          },
          getSelfUrl: () => undefined,
          getSignature: () => 'Test',
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should return undefined when getSelfUrl throws', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: {
          parse: (body) => body,
          getSelfUrl: () => {
            throw new Error('Self URL failed')
          },
          getSignature: () => 'Test',
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should keep the response URL when getSignature throws for every candidate', async () => {
      const value = 'https://www.example.com/feed/'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: '<feed>original</feed>' },
          'https://example.com/feed': { body: '<feed>reordered</feed>' },
        }),
        parser: {
          parse: (body) => body,
          getSelfUrl: () => undefined,
          getSignature: () => {
            throw new Error('Signature failed')
          },
        },
      })

      expect(await findCanonical(value, options)).toBe(value)
    })

    it('should return undefined when existsFn rejects', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
        }),
        existsFn: () => Promise.reject(new Error('DB connection failed')),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBeUndefined()
    })

    it('should reject candidate when parser throws on its body', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://www.example.com/feed/'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: '<feed>original</feed>' },
          'https://example.com/feed': { body: '<feed>malformed</feed>' },
        }),
        parser: {
          parse: (body) => {
            if (body === '<feed>malformed</feed>') {
              throw new Error('Malformed feed')
            }

            return body
          },
          getSelfUrl: () => undefined,
          getSignature: () => 'Test',
        },
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should handle empty tiers array', async () => {
      const value = 'http://www.example.com/feed/'
      const expected = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'http://www.example.com/feed/': { body },
          'https://www.example.com/feed/': { body },
        }),
        tiers: [],
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should resolve feed:// input URL', async () => {
      const value = 'feed://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should fall back to http when https throws for feed:// input URL', async () => {
      const value = 'feed://example.com/feed'
      const expected = 'http://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: (url: string) => {
          if (url.startsWith('https://')) {
            throw new Error('Connection refused')
          }

          return { status: 200, url, body, headers: new Headers() }
        },
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should not fetch https again after falling back to http', async () => {
      const value = 'feed://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: (url: string) => {
          fetchCalls.push(url)

          if (url.startsWith('https://')) {
            throw new Error('Connection refused')
          }

          return { status: 200, url, body, headers: new Headers() }
        },
        parser: createMockParser(undefined),
      })

      await findCanonical(value, options)

      expect(fetchCalls).toEqual(['https://example.com/feed', 'http://example.com/feed'])
    })

    it('should return the https URL that served the http fallback through a 302', async () => {
      const value = 'feed://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: (url: string) => {
          fetchCalls.push(url)

          if (url === 'https://example.com/feed' && fetchCalls.length === 1) {
            throw new Error('Connection refused')
          }

          return {
            status: 200,
            url: 'https://example.com/feed',
            body,
            headers: new Headers(),
            redirects: [{ url: 'http://example.com/feed', status: 302 }],
          }
        },
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should not fetch https again when it served the http fallback through a 302', async () => {
      const value = 'feed://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: (url: string) => {
          fetchCalls.push(url)

          if (url === 'https://example.com/feed' && fetchCalls.length === 1) {
            throw new Error('Connection refused')
          }

          return {
            status: 200,
            url: 'https://example.com/feed',
            body,
            headers: new Headers(),
            redirects: [{ url: 'http://example.com/feed', status: 302 }],
          }
        },
        parser: createMockParser(undefined),
      })

      await findCanonical(value, options)

      expect(fetchCalls).toEqual(['https://example.com/feed', 'http://example.com/feed'])
    })

    it('should fall back to http when https returns non-2xx for feed:// input URL', async () => {
      const value = 'feed://example.com/feed'
      const expected = 'http://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { status: 404 },
          'http://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should not fetch http when https succeeds for feed:// input URL', async () => {
      const value = 'feed://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
        onFetch: ({ url }) => {
          fetchCalls.push(url)
        },
      })

      await findCanonical(value, options)

      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    it('should fetch once when a rewrite maps both forms of feed:// input URL to one URL', async () => {
      const value = 'feed://example.com/feed'
      const fetchCalls: Array<string> = []
      const httpsRewrite: Rewrite = {
        match: () => true,
        rewrite: (url) => {
          const rewritten = new URL(url)
          rewritten.protocol = 'https:'

          return rewritten
        },
      }
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { status: 503 },
        }),
        parser: createMockParser(undefined),
        rewrites: [httpsRewrite],
        onFetch: ({ url }) => {
          fetchCalls.push(url)
        },
      })

      expect(await findCanonical(value, options)).toBeUndefined()
      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    it('should not fall back to http when https input URL fails', async () => {
      const value = 'https://example.com/feed'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: (url: string) => {
          fetchCalls.push(url)
          throw new Error('Connection refused')
        },
        parser: createMockParser(undefined),
      })

      await findCanonical(value, options)

      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    it('should not fall back to http for feed:https:// input URL', async () => {
      const value = 'feed:https://example.com/feed'
      const fetchCalls: Array<string> = []
      const options = toOptions({
        fetchFn: (url: string) => {
          fetchCalls.push(url)
          throw new Error('Connection refused')
        },
        parser: createMockParser(undefined),
      })

      await findCanonical(value, options)

      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })
  })

  describe('edge cases', () => {
    describe('URL parsing', () => {
      it('should handle IDN/Punycode mismatch between input and self URL', async () => {
        const value = 'https://xn--mnchen-3ya.example.com/feed'
        const expected = 'https://xn--mnchen-3ya.example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://xn--mnchen-3ya.example.com/feed': { body },
          }),
          parser: createMockParser('https://xn--mnchen-3ya.example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle self URL on different port', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com:8443/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com:8443/feed': { body },
          }),
          parser: createMockParser('https://example.com:8443/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle IPv6 address URLs', async () => {
        const value = 'https://[2001:db8::1]/feed'
        const expected = 'https://[2001:db8::1]/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://[2001:db8::1]/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle URLs with unusual but valid characters', async () => {
        const value = 'https://example.com/feed%20file.xml'
        const expected = 'https://example.com/feed%20file.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed%20file.xml': { body },
          }),
          parser: createMockParser('https://example.com/feed%20file.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject self URL with javascript: scheme', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('javascript:alert(1)'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject self URL with data: scheme', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('data:text/xml,<feed/>'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle malformed self URL gracefully', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('not a valid url at all :::'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should use self URL with credentials when it validates', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://user:pass@example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://user:pass@example.com/feed': { body },
          }),
          parser: createMockParser('https://user:pass@example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should resolve relative self URL with path traversal', async () => {
        const value = 'https://example.com/blog/posts/feed.xml'
        const expected = 'https://example.com/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/blog/posts/feed.xml': { body },
            'https://example.com/feed.xml': { body },
          }),
          parser: createMockParser('../../feed.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should lowercase uppercase hostname in input URL', async () => {
        const value = 'https://EXAMPLE.COM/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should lowercase uppercase hostname in self URL', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/canonical/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
            'https://example.com/canonical/feed': { body },
          }),
          parser: createMockParser('https://EXAMPLE.COM/canonical/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should normalize mixed case hostname', async () => {
        const value = 'https://Example.COM/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://EXAMPLE.COM/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('input URL', () => {
      it('should handle bare domain input URL', async () => {
        const value = 'example.com/feed.xml'
        const expected = 'https://example.com/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should handle protocol-relative input URL', async () => {
        const value = '//example.com/feed.xml'
        const expected = 'https://example.com/feed.xml'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed.xml': { body },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should return undefined for invalid input URL', async () => {
        const value = 'not a url at all :::'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            fetchCalls.push(url)
            return { status: 200, url, body: '<feed/>', headers: new Headers() }
          },
        })

        expect(await findCanonical(value, options)).toBeUndefined()
        expect(fetchCalls).toEqual([])
      })

      it('should return undefined for file:// scheme', async () => {
        const value = 'file:///etc/passwd'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            fetchCalls.push(url)
            return { status: 200, url, body: '<feed/>', headers: new Headers() }
          },
        })

        expect(await findCanonical(value, options)).toBeUndefined()
        expect(fetchCalls).toEqual([])
      })
    })

    describe('response body', () => {
      it('should return undefined for empty body response', async () => {
        const value = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '' },
          }),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBeUndefined()
      })

      it('should return undefined for undefined body response', async () => {
        const value = 'https://example.com/feed'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: async (url: string): Promise<FetchFnResponse> => ({
            status: 200,
            url,
            // @ts-expect-error: This is for testing purposes.
            body: undefined,
            headers: new Headers(),
          }),
        })

        expect(await findCanonical(value, options)).toBeUndefined()
      })

      it('should use response URL when self URL matches exactly', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const fetchCalls: Array<string> = []
        const options = toOptions({
          fetchFn: (url: string) => {
            fetchCalls.push(url)
            return { status: 200, url, body, headers: new Headers() }
          },
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
        expect(fetchCalls).toEqual(['https://example.com/feed'])
      })

      it('should recognize self URL as canonical form of response URL', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
            'https://example.com/feed': { body },
          }),
          parser: createMockParser('https://example.com/feed'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('self URL validation', () => {
      it('should reject self URL when it returns empty body', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>content</feed>' },
            'https://example.com/rss.xml': { body: '' },
          }),
          parser: createMockParser('https://example.com/rss.xml'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject self URL when both protocols fail to match', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://example.com/feed': { body: '<feed>original</feed>' },
            'https://other.example.com/rss': { status: 404 },
            'http://other.example.com/rss': { body: '<feed>different</feed>' },
          }),
          parser: createMockParser('https://other.example.com/rss'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should reject self URL when redirect destination is invalid', async () => {
        const value = 'https://example.com/feed'
        const expected = 'https://example.com/feed'
        const body = '<feed></feed>'
        const options = toOptions({
          fetchFn: (url: string) => {
            if (url === 'https://example.com/feed') {
              return { status: 200, url, body, headers: new Headers() }
            }
            if (url === 'https://self.example.com/rss') {
              return { status: 200, url: 'file:///invalid', body, headers: new Headers() }
            }
            throw new Error(`Unexpected fetch: ${url}`)
          },
          parser: createMockParser('https://self.example.com/rss'),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    describe('candidate comparison', () => {
      it('should return early when existsFn matches non-first candidate', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://www.example.com/feed'
        const body = '<feed></feed>'
        const differentBody = '<feed><item>different</item></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: (url: string) => {
            if (url === 'https://example.com/feed') {
              return { status: 200, url, body: differentBody, headers: new Headers() }
            }
            return { status: 200, url, body, headers: new Headers() }
          },
          existsFn: (url) => (url === 'https://www.example.com/feed' ? { id: 7 } : undefined),
          tiers: [
            { stripWww: true, stripTrailingSlash: true },
            { stripWww: false, stripTrailingSlash: true },
          ],
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should skip candidate when parser.parse returns undefined on compared body', async () => {
        const value = 'https://www.example.com/feed/'
        const expected = 'https://www.example.com/feed'
        const validBody = '<feed><valid>true</valid></feed>'
        const unparseable = '<nope>not a feed</nope>'
        const options = toOptions({
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body: validBody },
            'https://example.com/feed': { body: unparseable },
            'https://www.example.com/feed': { body: validBody },
          }),
          parser: {
            parse: (body) => {
              if (body.includes('nope')) {
                return
              }
              return body
            },
            getSelfUrl: () => undefined,
            getSignature: (feed) => feed,
          },
          tiers: [
            { stripWww: true, stripTrailingSlash: true },
            { stripWww: false, stripTrailingSlash: true },
          ],
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })
    })

    it('should return the same URL when re-run on its own result', async () => {
      const value = 'http://www.example.com/feed/?utm_source=rss'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'http://www.example.com/feed/?utm_source=rss': { body },
          'http://example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      })

      expect(await findCanonical(value, options)).toBe(expected)
      expect(await findCanonical(expected, options)).toBe(expected)
    })
  })

  describe('URL probes', () => {
    const createProbe = (matchParam: string, candidatePath: string): Probe => ({
      match: (url) => url.searchParams.has(matchParam),
      getCandidates: (url) => {
        const candidate = new URL(url)
        candidate.pathname = candidatePath
        candidate.searchParams.delete(matchParam)
        return [candidate.href]
      },
    })

    it('should use probe candidate when it returns equivalent content', async () => {
      const value = 'https://example.com/?feed=rss2'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=rss2': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should keep original URL when probe candidates fail', async () => {
      const value = 'https://example.com/?feed=rss2'
      const expected = 'https://example.com/?feed=rss2'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=rss2': { body },
          'https://example.com/feed': { status: 404 },
        }),
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should reject probe candidate with different content', async () => {
      const value = 'https://example.com/?feed=rss2'
      const expected = 'https://example.com/?feed=rss2'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=rss2': { body: '<feed>original</feed>' },
          'https://example.com/feed': { body: '<feed>different</feed>' },
        }),
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should adopt the target of a probe candidate that redirects permanently', async () => {
      const value = 'https://example.com/?feed=rss2'
      const expected = 'https://example.com/blog/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=rss2': { body },
          'https://example.com/feed': {
            body,
            url: 'https://example.com/blog/feed',
            redirects: [{ url: 'https://example.com/feed', status: 301 }],
          },
        }),
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should try probe candidates in order', async () => {
      const value = 'https://example.com/?feed=atom'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=atom': { body },
          'https://example.com/feed/atom': { status: 404 },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
        probes: [
          {
            match: (url) => url.searchParams.has('feed'),
            getCandidates: (url) => {
              const first = new URL(url)
              first.pathname = '/feed/atom'
              first.searchParams.delete('feed')

              const second = new URL(url)
              second.pathname = '/feed'
              second.searchParams.delete('feed')

              return [first.href, second.href]
            },
          },
        ],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should skip probes that do not match', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })

      expect(await findCanonical(value, options)).toBe(expected)
    })

    it('should return undefined when onMatch throws for probe candidate', async () => {
      const value = 'https://example.com/?feed=rss2'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://example.com/?feed=rss2': { body },
          'https://example.com/feed': { body },
        }),
        onMatch: ({ url }) => {
          if (url === 'https://example.com/feed') {
            throw new Error('Callback failed')
          }
        },
        parser: createMockParser(undefined),
        probes: [createProbe('feed', '/feed')],
      })
      expect(await findCanonical(value, options)).toBeUndefined()
    })
  })
})
