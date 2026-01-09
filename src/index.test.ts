import { describe, expect, it } from 'bun:test'
import { findCanonical } from './index.js'
import { feedburnerRewrite } from './rewrites/feedburner.js'
import type {
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
  Probe,
  Rewrite,
} from './types.js'

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

  describe('core behavior', () => {
    describe('self URL handling', () => {
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
          fetchFn: async (url: string) => {
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

      it('should use candidate URL even when it redirects', async () => {
        const value = 'https://www.example.com/feed'
        const expected = 'https://example.com/feed'
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
    it('should normalize FeedBurner aliases to canonical domain', async () => {
      const value = 'https://feedproxy.google.com/TechCrunch?format=xml'
      const expected = 'https://feeds.feedburner.com/TechCrunch'
      const body = '<feed></feed>'
      const options = toOptions({
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/TechCrunch?format=xml': { body },
          'https://feeds.feedburner.com/TechCrunch': { body },
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
          }),
          existsFn: async (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
          parser: createMockParser(undefined),
        })

        expect(await findCanonical(value, options)).toBe(expected)
      })

      it('should check candidates in tier order', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const checkedUrls: Array<string> = []
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: async (url) => {
            checkedUrls.push(url)
            return undefined
          },
        })

        await findCanonical(value, options)

        expect(checkedUrls[0]).toBe('https://example.com/feed')
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
          existsFn: async () => undefined,
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
          }),
          existsFn: async (url) => {
            checkedUrls.push(url)
            return url === 'https://www.example.com/feed' ? { id: 99 } : undefined
          },
        })

        expect(await findCanonical(value, options)).toBe(expected)
        expect(checkedUrls).toContain('https://example.com/feed')
        expect(checkedUrls).toContain('https://www.example.com/feed')
      })
    })

    describe('parser', () => {
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

      it('should propagate error when onFetch throws', async () => {
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

        expect(findCanonical(value, options)).rejects.toThrow('Callback error')
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

      it('should propagate error when onMatch throws', async () => {
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

        expect(findCanonical(value, options)).rejects.toThrow('Callback error')
      })
    })

    describe('onExists', () => {
      it('should call onExists when existsFn finds match with data', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const existingData = { id: 123, savedAt: '2024-01-01' }
        let existsCallData: { url: string; data: unknown } | undefined
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: async (url) => {
            if (url === 'https://example.com/feed') {
              return existingData
            }
            return undefined
          },
          onExists: ({ url, data }) => {
            existsCallData = { url, data }
          },
        })

        await findCanonical(value, options)

        expect(existsCallData).toEqual({ url: 'https://example.com/feed', data: existingData })
      })

      it('should propagate error when onExists throws', async () => {
        const value = 'https://www.example.com/feed/'
        const body = '<feed></feed>'
        const options = toOptions({
          parser: createMockParser(undefined),
          fetchFn: createMockFetch({
            'https://www.example.com/feed/': { body },
          }),
          existsFn: async (url) => (url === 'https://example.com/feed' ? { id: 55 } : undefined),
          onExists: () => {
            throw new Error('Callback error')
          },
        })

        expect(findCanonical(value, options)).rejects.toThrow('Callback error')
      })
    })
  })

  describe('error handling', () => {
    it('should return undefined when fetch throws', async () => {
      const value = 'https://example.com/feed.xml'
      const options = toOptions({
        parser: createMockParser(undefined),
        fetchFn: async () => {
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
        fetchFn: async () => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => ({
            status: 200,
            url,
            body: undefined as unknown as string,
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
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
          fetchFn: async (url: string) => {
            if (url === 'https://example.com/feed') {
              return { status: 200, url, body: differentBody, headers: new Headers() }
            }
            return { status: 200, url, body, headers: new Headers() }
          },
          existsFn: async (url) => (url === 'https://www.example.com/feed' ? { id: 7 } : undefined),
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
                return undefined
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
  })
})
