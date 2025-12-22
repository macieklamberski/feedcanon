import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type {
  CanonicalizeOptions,
  FetchFnResponse,
  ParserAdapter,
  PlatformHandler,
} from './types.js'

describe('canonicalize', () => {
  const createMockParser = (selfUrl: string | undefined): ParserAdapter<unknown> => {
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

  describe('canonicalization cases', () => {
    // Case 1: Platform-Specific Domain (FeedBurner)
    //
    // Input: https://feedproxy.google.com/TechCrunch?format=xml
    // Result: https://feeds.feedburner.com/TechCrunch
    //
    // FeedBurner URLs use various aliases (feedproxy.google.com, feeds2.feedburner.com).
    // The platform handler normalizes all FeedBurner aliases to the canonical
    // feeds.feedburner.com domain and strips FeedBurner-specific query params.
    it('case 1: should normalize FeedBurner aliases to canonical domain', async () => {
      const value = 'https://feedproxy.google.com/TechCrunch?format=xml'
      const expected = 'https://feeds.feedburner.com/TechCrunch'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/TechCrunch?format=xml': { body },
          'https://feeds.feedburner.com/TechCrunch': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 2: Polluted URL That Works Simplified
    //
    // Input: http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar#comments
    // Result: https://example.com/feed
    //
    // URLs with tracking params (utm_source, utm_medium), www prefix, and trailing
    // slashes can often be simplified. The algorithm generates cleaner variants,
    // verifies they return the same content, then attempts HTTPS upgrade.
    it('case 2: should clean polluted URL and upgrade to HTTPS', async () => {
      const value = 'http://www.example.com/feed/?utm_source=twitter&utm_medium=social'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://www.example.com/feed/?utm_source=twitter&utm_medium=social': { body },
          'http://example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 3: Polluted URL with Working Self URL
    //
    // Input: http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
    // Result: https://blog.example.com/rss.xml
    //
    // When the feed declares a self URL that is cleaner than the input URL (e.g.,
    // HTTPS instead of HTTP, no www, no query params), the algorithm validates the
    // self URL returns the same content and adopts it as canonical.
    it('case 3: should adopt cleaner self URL when valid', async () => {
      const value = 'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567'
      const expected = 'https://blog.example.com/rss.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://www.blog.example.com/rss.xml?source=homepage&_=1702934567': { body },
          'https://blog.example.com/rss.xml': { body },
        }),
        parser: createMockParser('https://blog.example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 4: Self URL Does Not Work
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/feed (outdated, server moved)
    // Result: https://example.com/feed
    //
    // When a feed declares a self URL pointing to an outdated or dead domain, the
    // algorithm detects the self URL fails (404, timeout) and falls back to using
    // the response URL that is known to work.
    it('case 4: should use responseUrl when self URL does not work', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://old.example.com/feed': { status: 404 },
        }),
        parser: createMockParser('https://old.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 5: Self URL Produces Different Feed
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/feed/full (misconfigured, points to full-text variant)
    // Result: https://example.com/feed
    //
    // When a publisher misconfigures their self URL to point to a different feed
    // variant (e.g., full-text vs summary), the algorithm detects the content
    // difference via signature comparison and uses the response URL instead.
    it('case 5: should use responseUrl when self URL produces different content', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>summary</feed>' },
          'https://example.com/feed/full': { body: '<feed>full content</feed>' },
        }),
        parser: createMockParser('https://example.com/feed/full'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 6: Input URL Redirects
    //
    // Input: http://old-blog.example.com/rss
    // Redirects: 301 → https://blog.example.com/feed
    // Result: https://blog.example.com/feed
    //
    // When fetching the input URL results in redirects (301, 302), the algorithm
    // follows them and uses the final destination URL as the canonical. The
    // original URL becomes an alias pointing to the canonical.
    it('case 6: should follow redirects and use final destination', async () => {
      const value = 'http://old-blog.example.com/rss'
      const expected = 'https://blog.example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://old-blog.example.com/rss': { body, url: 'https://blog.example.com/feed' },
          'https://blog.example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 7: HTTPS Upgrade Success
    //
    // Input: http://example.com/feed
    // Result: https://example.com/feed
    //
    // When the input URL uses HTTP but the server also supports HTTPS (returning
    // the same content), the algorithm upgrades to HTTPS. This provides security
    // even when the server doesn't redirect HTTP to HTTPS automatically.
    it('case 7: should upgrade HTTP to HTTPS when content matches', async () => {
      const value = 'http://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 8: HTTPS Upgrade Failure
    //
    // Input: http://legacy.example.com/feed.rss
    // Result: http://legacy.example.com/feed.rss
    //
    // When the server doesn't support HTTPS (connection refused, SSL error, timeout),
    // the algorithm gracefully falls back to HTTP. This handles legacy servers that
    // only serve content over HTTP.
    it('case 8: should keep HTTP when HTTPS fails', async () => {
      const value = 'http://legacy.example.com/feed.rss'
      const expected = 'http://legacy.example.com/feed.rss'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://legacy.example.com/feed.rss': { body },
          'https://legacy.example.com/feed.rss': { status: 500 },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 9: WWW vs Non-WWW Mismatch
    //
    // Input: https://www.example.com/feed
    // Self URL: https://example.com/feed (no www)
    // Result: https://example.com/feed
    //
    // When input has www but self URL doesn't (or vice versa), the algorithm prefers
    // non-www as it's shorter/cleaner. It verifies the non-www variant returns the
    // same content before adopting it.
    it('case 9: should prefer non-www when both work', async () => {
      const value = 'https://www.example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 10: Feed Protocol (feed://)
    //
    // Input: https://example.com/rss.xml
    // Self URL: feed://example.com/rss.xml
    // Result: https://example.com/rss.xml
    //
    // URLs using feed:// (or rss://, pcast://, itpc://) protocols are converted to
    // https:// before fetching. These legacy protocols were used for feed reader
    // registration but are not valid for HTTP fetching.
    it('case 10: should handle feed:// protocol in self URL', async () => {
      const value = 'https://example.com/rss.xml'
      const expected = 'https://example.com/rss.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/rss.xml': { body },
        }),
        parser: createMockParser('feed://example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 11: Multiple FeedBurner Aliases
    //
    // Input A: https://feeds2.feedburner.com/blog
    // Input B: http://feedproxy.google.com/blog?format=rss
    // Input C: https://feeds.feedburner.com/blog
    // Result: https://feeds.feedburner.com/blog (all three)
    //
    // Multiple users subscribing via different FeedBurner aliases (feeds2.feedburner.com,
    // feedproxy.google.com, feeds.feedburner.com) should all resolve to the same
    // canonical domain.
    it('case 11: should normalize different FeedBurner aliases to same canonical domain', async () => {
      const expected = 'https://feeds.feedburner.com/blog'
      const body = '<feed></feed>'

      const optionsA = {
        fetchFn: createMockFetch({
          'https://feeds2.feedburner.com/blog': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
      }
      const optionsB = {
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/blog?format=rss': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
      }
      const optionsC = {
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/blog?format=xml': { body },
          'https://feeds.feedburner.com/blog': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize('https://feeds2.feedburner.com/blog', optionsA)).toBe(expected)
      expect(await canonicalize('https://feedproxy.google.com/blog?format=rss', optionsB)).toBe(
        expected,
      )
      expect(await canonicalize('https://feeds.feedburner.com/blog?format=xml', optionsC)).toBe(
        expected,
      )
    })

    // Case 12: Relative Self URL
    //
    // Input: https://example.com/blog/feed.xml
    // Self URL: feed.xml (relative)
    // Result: https://example.com/blog/feed.xml
    //
    // Some feeds declare relative self URLs (e.g., "feed.xml" instead of full URL).
    // The algorithm resolves these relative URLs against the response URL base
    // to get an absolute URL for variant generation.
    it('case 12: should resolve relative self URL', async () => {
      const value = 'https://example.com/blog/feed.xml'
      const expected = 'https://example.com/blog/feed.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/blog/feed.xml': { body },
        }),
        parser: createMockParser('feed.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 13: Functional query params
    //
    // Input: https://example.com/feed?format=rss
    // Variant: https://example.com/feed (stripped query params)
    // Result: https://example.com/feed?format=rss
    //
    // Some query params are functional (e.g., format=rss) and stripping them
    // changes the content. When the stripped variant returns different content,
    // the algorithm keeps the original URL with functional params.
    it('case 13: should keep functional query params when variant returns different content', async () => {
      const value = 'https://example.com/feed?format=rss'
      const expected = 'https://example.com/feed?format=rss'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed?format=rss': { body: '<feed>rss format</feed>' },
          'https://example.com/feed': { body: '<feed>default format</feed>' },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 14: Empty/Missing Self URL
    //
    // Input: https://example.com/feed
    // Self URL: (none)
    // Result: https://example.com/feed
    //
    // When a feed doesn't declare a rel="self" link, the algorithm uses the
    // response URL as the sole source for generating variants. This is common
    // for older or simpler feeds.
    it('case 14: should use responseUrl when no self URL present', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 15: All Variants Fail Except Original
    //
    // Input: https://special.example.com:8443/api/v2/feed.json?auth=token123
    // Result: https://special.example.com:8443/api/v2/feed.json?auth=token123
    //
    // For complex URLs with non-standard ports and required auth tokens, simplified
    // variants will fail. The algorithm tries cleaner variants first but falls back
    // to the original URL when all simplifications fail.
    it('case 15: should fall back to original when all variants fail', async () => {
      const value = 'https://special.example.com:8443/api/v2/feed.json?auth=token123'
      const expected = 'https://special.example.com:8443/api/v2/feed.json?auth=token123'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://special.example.com:8443/api/v2/feed.json?auth=token123': { body },
          'https://special.example.com/api/v2/feed.json': { status: 404 },
          'https://special.example.com:8443/api/v2/feed.json': { status: 401 },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 16: Redirect Loop Prevention
    //
    // Input: https://example.com/feed
    // Redirect: 301 → https://example.com/rss → 301 → https://example.com/feed (loop)
    // Result: undefined (fetch failed)
    //
    // When the server has a redirect loop, the fetch implementation detects it
    // and fails. The algorithm returns undefined since the feed cannot be fetched.
    it('case 16: should return undefined when fetch fails due to redirect loop', async () => {
      const value = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async () => {
          throw new Error('Redirect loop detected')
        },
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    // Case 17: Variant returns different content
    //
    // Input: https://www.example.com/feed
    // Variant: https://example.com/feed (returns completely different feed)
    // Result: https://www.example.com/feed
    //
    // When a cleaner variant (e.g., without www) returns different content than
    // the original, the variant is rejected and the original URL is kept. This
    // can happen when www and non-www serve different feeds.
    it('case 17: should reject variant when content differs', async () => {
      const value = 'https://www.example.com/feed'
      const expected = 'https://www.example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: '<feed><title>Blog Feed</title></feed>' },
          'https://example.com/feed': { body: '<feed><title>Company News</title></feed>' },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 18: Self URL Returns HTML (Not Feed)
    //
    // Input: https://example.com/feed.xml
    // Self URL: https://example.com/blog (returns HTML, not feed)
    // Result: https://example.com/feed.xml
    //
    // When a feed's self URL points to an HTML page (publisher misconfiguration),
    // the algorithm skips that variant because it's not a valid feed. It falls
    // back to using the response URL which is known to be a valid feed.
    it('case 18: should ignore self URL that points to non-feed content', async () => {
      const value = 'https://example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { body: '<feed></feed>' },
          'https://example.com/blog': { body: '<!DOCTYPE html><html></html>' },
        }),
        parser: createMockParser('https://example.com/blog'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 19: Self URL triggers redirect chain
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/rss (outdated, redirects to responseUrl)
    // Result: https://example.com/feed
    //
    // When a self URL is outdated and redirects to a new location, the algorithm
    // uses the redirect destination (not the original selfUrl) as the variant source.
    // This ensures we use the current canonical location, not stale URLs.
    it('case 19: should use redirect destination when self URL redirects', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://old.example.com/rss': { body, url: 'https://example.com/feed' },
        }),
        parser: createMockParser('https://old.example.com/rss'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 20: Platform handler canonical is dead
    //
    // Input: http://feedproxy.google.com/MyBlog
    // Result: undefined (fetch failed)
    //
    // When a platform handler transforms the input URL but the canonical domain
    // is dead (service shutdown), the algorithm returns undefined since the feed
    // cannot be fetched.
    it('case 20: should return undefined when platform canonical is dead', async () => {
      const value = 'https://feedproxy.google.com/MyBlog'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/MyBlog': { status: 404 },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    // Case 21: Case sensitivity mismatch
    //
    // Input: https://example.com/Blog/Feed.XML
    // Self URL: https://example.com/blog/feed.xml (lowercase)
    // Result: https://example.com/blog/feed.xml
    //
    // URL paths are case-sensitive per RFC, but many servers are case-insensitive.
    // When input has mixed case but self URL is lowercase, the algorithm prefers
    // lowercase as conventionally cleaner, after verifying it returns same content.
    it('case 21: should prefer lowercase URL path when content matches', async () => {
      const value = 'https://example.com/Blog/Feed.XML'
      const expected = 'https://example.com/blog/feed.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/Blog/Feed.XML': { body },
          'https://example.com/blog/feed.xml': { body },
        }),
        parser: createMockParser('https://example.com/blog/feed.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 22: Scheme-relative input
    //
    // Input: https://example.com/feed
    // Self URL: //example.com/feed (scheme-relative)
    // Result: https://example.com/feed
    //
    // Scheme-relative URLs (//host/path) lack a protocol. The algorithm defaults
    // to HTTPS when resolving, falling back to HTTP if HTTPS fails. This is rare
    // for direct feed URLs but handled for completeness.
    it('case 22: should handle scheme-relative URL by defaulting to HTTPS', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('//example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 23: Standard port in URL
    //
    // Input: https://example.com:443/feed
    // Result: https://example.com/feed
    //
    // Default ports (443 for HTTPS, 80 for HTTP) are redundant and should be
    // stripped during normalization. URLs with and without default port are
    // semantically identical.
    it('case 23: should strip default port from URL', async () => {
      const value = 'https://example.com:443/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com:443/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('canonicalization cases (continued)', () => {
    // Case 24: Response redirects to FeedBurner
    //
    // Input: https://example.com/feed
    // Redirects: → https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When the input URL redirects to a FeedBurner alias, the platform handler
    // should normalize the response URL to the canonical FeedBurner domain.
    it('case 24: should apply platform handler when response redirects to FeedBurner', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body, url: 'https://feedproxy.google.com/ExampleBlog' },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 25: Self URL is FeedBurner alias
    //
    // Input: https://example.com/feed
    // Self URL: https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When a feed declares a FeedBurner alias as its self URL, the platform handler
    // should normalize it to the canonical domain before validation.
    it('case 25: should apply platform handler to FeedBurner self URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser('https://feedproxy.google.com/ExampleBlog'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 26: HTTPS returns different content
    //
    // Input: http://example.com/feed
    // Result: http://example.com/feed
    //
    // When HTTPS returns different content (not a network failure), the algorithm
    // should fall back to HTTP. This differs from Case 8 where HTTPS fails entirely.
    // Some servers serve different feeds over HTTP vs HTTPS.
    it('case 26: should keep HTTP when HTTPS returns different content', async () => {
      const value = 'http://example.com/feed'
      const expected = 'http://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: '<feed>http version</feed>' },
          'https://example.com/feed': { body: '<feed>https version</feed>' },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 27: Variant matches response URL
    //
    // Input: https://www.example.com/feed
    // Self URL: https://other.example.com/feed (different domain)
    // Result: https://www.example.com/feed
    //
    // When a variant matches responseUrl but not variantSource, it should set
    // winningUrl to responseUrl and break early without extra fetching. This
    // optimizes the common case where responseUrl is already clean.
    it('case 27: should use responseUrl when variant matches it', async () => {
      const value = 'https://www.example.com/feed'
      const expected = 'https://www.example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: async (url) => {
          if (url === 'https://www.example.com/feed') {
            return { status: 200, url, body, headers: new Headers() }
          }
          throw new Error(`Unexpected fetch: ${url}`)
        },
        parser: createMockParser('https://other.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 28: Parser returns undefined
    //
    // Input: https://example.com/feed
    // Parser: Returns undefined (unparseable content)
    // Result: undefined
    //
    // When parser.parse() returns undefined (unparseable or invalid content),
    // the algorithm should return undefined since the URL doesn't point
    // to a valid feed.
    it('case 28: should return undefined when parser returns undefined', async () => {
      const value = 'https://example.com/feed'
      const body = '<invalid>not a feed</invalid>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: {
          parse: () => undefined,
          getSelfUrl: () => undefined,
          getSignature: () => ({}),
        },
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    // Case 29: Self URL with fragment
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/feed#section
    // Result: https://example.com/feed
    //
    // Self URL with fragment (#section) should have fragment stripped during
    // resolution. Fragments are not sent to servers and should not be part
    // of the canonical URL.
    it('case 29: should strip fragment from self URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://example.com/feed#section'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 30: Self URL protocol differs
    //
    // Input: https://example.com/feed
    // Self URL: http://example.com/feed (HTTP instead of HTTPS)
    // Result: https://example.com/feed
    //
    // When self URL uses HTTP but input uses HTTPS, both protocols are considered
    // as variants. HTTPS is preferred when content matches, providing security
    // even when the feed declares an HTTP self URL.
    it('case 30: should handle self URL with different protocol', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'http://example.com/feed': { body },
        }),
        parser: createMockParser('http://example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 31: All variants fail
    //
    // Input: https://www.example.com/feed/
    // Result: https://www.example.com/feed/
    //
    // When all normalized variants fail (404, network error) but the original
    // variantSource works, it should be returned as the canonical URL. This
    // ensures we always return a working URL.
    it('case 31: should fall back to variantSource when all variants fail', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { status: 404 },
          'https://www.example.com/feed': { status: 404 },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 32: Variant redirects
    //
    // Input: https://www.example.com/feed
    // Variant: https://example.com/feed → redirects to https://canonical.example.com/feed
    // Result: https://example.com/feed
    //
    // When a variant URL redirects to a different destination, the algorithm
    // uses the original variant URL (not the redirect destination) if content
    // matches. This provides a stable canonical URL.
    it('case 32: should use variant URL even when it redirects', async () => {
      const value = 'https://www.example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body },
          'https://example.com/feed': { body, url: 'https://canonical.example.com/feed' },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 33: Self URL redirects to FeedBurner
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/rss → redirects to https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When selfUrl response redirects to a FeedBurner alias, the platform handler
    // should normalize the redirect destination for variant generation. This handles
    // feeds that have migrated to FeedBurner.
    it('case 33: should apply platform handler to self URL redirect destination', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://feeds.feedburner.com/ExampleBlog'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://old.example.com/rss': { body, url: 'https://feedproxy.google.com/ExampleBlog' },
          'https://feeds.feedburner.com/ExampleBlog': { body },
        }),
        parser: createMockParser('https://old.example.com/rss'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('with existsFn option', () => {
    it('should return matching URL when existsFn finds match', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
        }),
        existsFn: async (url) => (url === 'https://example.com/feed' ? { id: 42 } : undefined),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    it('should check variants in tier order', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const checkedUrls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
        }),
        existsFn: async (url) => {
          checkedUrls.push(url)
          return undefined
        },
      }

      await canonicalize(value, options)

      expect(checkedUrls[0]).toBe('https://example.com/feed')
    })

    it('should continue testing when existsFn returns false', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { body },
        }),
        existsFn: async () => undefined,
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    it('should return non-first variant when existsFn matches it', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://www.example.com/feed'
      const body = '<feed></feed>'
      const checkedUrls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
        }),
        existsFn: async (url) => {
          checkedUrls.push(url)
          return url === 'https://www.example.com/feed' ? { id: 99 } : undefined
        },
      }

      expect(await canonicalize(value, options)).toBe(expected)
      expect(checkedUrls).toContain('https://example.com/feed')
      expect(checkedUrls).toContain('https://www.example.com/feed')
    })
  })

  describe('with parser option', () => {
    it('should use selfUrl as variant source when valid', async () => {
      const value = 'https://cdn.example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://cdn.example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('when fetch fails', () => {
    it('should return undefined when fetch throws', async () => {
      const value = 'https://example.com/feed.xml'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    it('should return undefined when fetch returns non-2xx', async () => {
      const value = 'https://example.com/feed.xml'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })
  })

  describe('platform handler edge cases', () => {
    // Case 34: Platform handler throws exception
    //
    // When a platform handler throws an exception during match() or normalize(),
    // the algorithm should continue gracefully using the original URL.
    it('case 34: should continue gracefully when platform handler throws', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const throwingHandler: PlatformHandler = {
        match: () => {
          throw new Error('Handler error')
        },
        normalize: (url) => url,
      }
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        platforms: [throwingHandler],
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 35: Multiple platform handlers match
    //
    // When multiple platform handlers could match a URL, only the first matching
    // handler should be applied (handlers are checked in order, first match wins).
    it('case 35: should apply only first matching platform handler', async () => {
      const value = 'https://multi.example.com/feed'
      const expected = 'https://first.example.com/feed'
      const body = '<feed></feed>'
      const firstHandler: PlatformHandler = {
        match: (url) => url.hostname === 'multi.example.com',
        normalize: (url) => {
          url.hostname = 'first.example.com'
          return url
        },
      }
      const secondHandler: PlatformHandler = {
        match: (url) => url.hostname === 'multi.example.com',
        normalize: (url) => {
          url.hostname = 'second.example.com'
          return url
        },
      }
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://first.example.com/feed': { body },
        }),
        platforms: [firstHandler, secondHandler],
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('URL parsing edge cases', () => {
    // Case 36: IDN/Punycode mismatch
    //
    // When input URL uses Unicode hostname and self URL uses Punycode (or vice versa),
    // they should be recognized as equivalent after normalization.
    it('case 36: should handle IDN/Punycode mismatch between input and self URL', async () => {
      const value = 'https://xn--mnchen-3ya.example.com/feed'
      const expected = 'https://xn--mnchen-3ya.example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://xn--mnchen-3ya.example.com/feed': { body },
        }),
        parser: createMockParser('https://xn--mnchen-3ya.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 37: Port number mismatch
    //
    // When self URL specifies a different port than the input URL, the algorithm
    // validates the self URL and uses it as variant source if content matches.
    // Note: Non-standard ports are preserved (only :80/:443 stripped by default tiers).
    it('case 37: should handle self URL on different port', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com:8443/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://example.com:8443/feed': { body },
        }),
        parser: createMockParser('https://example.com:8443/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 38: IPv6 address URL
    //
    // URLs with IPv6 addresses should be handled correctly, including bracket notation.
    it('case 38: should handle IPv6 address URLs', async () => {
      const value = 'https://[2001:db8::1]/feed'
      const expected = 'https://[2001:db8::1]/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://[2001:db8::1]/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 39: URL with unusual but valid characters
    //
    // URLs containing percent-encoded characters, unicode in path, or other unusual
    // but valid URL characters should be handled correctly.
    it('case 39: should handle URLs with unusual but valid characters', async () => {
      const value = 'https://example.com/feed%20file.xml'
      const expected = 'https://example.com/feed%20file.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed%20file.xml': { body },
        }),
        parser: createMockParser('https://example.com/feed%20file.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 40: Self URL with dangerous scheme
    //
    // Self URLs with dangerous schemes (javascript:, data:, file:) should be
    // rejected and the algorithm should fall back to responseUrl.
    it('case 40: should reject self URL with javascript: scheme', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('javascript:alert(1)'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    it('case 41: should reject self URL with data: scheme', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('data:text/xml,<feed/>'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 41: Malformed/unparseable self URL
    //
    // When self URL is completely malformed and cannot be parsed, the algorithm
    // should continue gracefully using responseUrl.
    it('case 42: should handle malformed self URL gracefully', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('not a valid url at all :::'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 42: Self URL with credentials
    //
    // When self URL contains embedded credentials and validates (same content),
    // it becomes the variant source. Since default tiers have stripAuthentication: false,
    // credentials are preserved in the canonical URL.
    //
    // TODO: Consider preferring simpler/more secure URL when both work (e.g., prefer
    // URL without credentials when both authenticated and non-authenticated work).
    it('case 43: should use self URL with credentials when it validates', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://user:pass@example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://user:pass@example.com/feed': { body },
        }),
        parser: createMockParser('https://user:pass@example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 43: Relative self URL edge case
    //
    // Relative self URLs with path traversal (../) should resolve correctly
    // against the response URL base and be used if content matches.
    it('case 44: should resolve relative self URL with path traversal', async () => {
      const value = 'https://example.com/blog/posts/feed.xml'
      const expected = 'https://example.com/feed.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/blog/posts/feed.xml': { body },
          'https://example.com/feed.xml': { body },
        }),
        parser: createMockParser('../../feed.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('algorithm path coverage', () => {
    // Case 44: existsFn returns true for non-first variant
    //
    // When existsFn returns true for a variant that isn't the first one tested,
    // that variant should be returned immediately (early termination).
    it('case 45: should return early when existsFn matches non-first variant', async () => {
      const value = 'https://www.example.com/feed'
      const expected = 'https://www.example.com/feed'
      const body = '<feed></feed>'
      const differentBody = '<feed><item>different</item></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
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
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 45: Mixed case hostname
    //
    // Hostnames are case-insensitive per RFC. URLs with different case should
    // be normalized to lowercase and treated as equivalent.
    it('case 46: should normalize mixed case hostname', async () => {
      const value = 'https://Example.COM/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://EXAMPLE.COM/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 46: All tiers produce identical URL
    //
    // When all normalization tiers produce the same URL (degenerate case),
    // the algorithm should handle it gracefully without unnecessary fetches.
    it('case 47: should handle when all tiers produce identical URL', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
          fetchCalls.push(url)
          return { status: 200, url, body, headers: new Headers() }
        },
        tiers: [{ stripWww: true }, { stripWww: false }],
      }

      expect(await canonicalize(value, options)).toBe(expected)
      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    // Case 47: Self URL redirects to different domain
    //
    // When self URL validates but redirects to a different final URL,
    // the redirect destination becomes the variant source.
    it('case 48: should use self URL redirect destination as variant source', async () => {
      const value = 'https://old.example.com/feed'
      const expected = 'https://new.example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://old.example.com/feed': { body },
          'https://alias.example.com/feed': { body, url: 'https://new.example.com/feed' },
          'https://new.example.com/feed': { body },
        }),
        parser: createMockParser('https://alias.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 48: Variant testing exhausts all options
    //
    // When no variant matches (all return different content or fail),
    // the algorithm falls back to variantSource.
    it('case 49: should fall back to variantSource when all variants fail', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const differentBody = '<feed><different/></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
          if (url === 'https://www.example.com/feed/') {
            return { status: 200, url, body, headers: new Headers() }
          }
          return { status: 200, url, body: differentBody, headers: new Headers() }
        },
        tiers: [
          { stripWww: true, stripTrailingSlash: true },
          { stripWww: false, stripTrailingSlash: true },
        ],
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 49: First matching variant wins
    //
    // When multiple variants would match (same content), the first one
    // tested (cleanest tier) wins.
    it('case 50: should return first matching variant when multiple match', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
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
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('redirect edge cases', () => {
    // Case 50: Redirect adds tracking parameters
    //
    // Input: https://example.com/feed
    // Redirects: → https://example.com/feed?utm_source=redirect&fbclid=abc123
    // Result: https://example.com/feed?utm_source=redirect&fbclid=abc123
    //
    // When the server redirects to a URL with tracking params added, we use
    // the redirect destination. Using the clean variant would cause a redirect
    // on every fetch. The server chose to add these params, so we respect that.
    it('case 51: should use redirect destination when server adds tracking params', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed?utm_source=redirect&fbclid=abc123'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body,
            url: 'https://example.com/feed?utm_source=redirect&fbclid=abc123',
          },
          'https://example.com/feed?utm_source=redirect&fbclid=abc123': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 51: Redirect changes protocol (HTTP to HTTPS)
    //
    // When HTTP redirects to HTTPS (common pattern), the algorithm
    // should use the HTTPS URL as canonical.
    it('case 52: should use HTTPS when HTTP redirects to it', async () => {
      const value = 'http://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body, url: 'https://example.com/feed' },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 52: Redirect to different domain with same content
    //
    // When redirected to a completely different domain that serves
    // the same content, the redirect destination becomes canonical.
    it('case 53: should use redirect destination domain', async () => {
      const value = 'https://old.example.com/feed'
      const expected = 'https://new.example.org/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://old.example.com/feed': { body, url: 'https://new.example.org/feed' },
          'https://new.example.org/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 53: Self URL points to redirect that returns different content
    //
    // When self URL redirects but the destination returns different content,
    // the algorithm should fall back to responseUrl.
    it('case 54: should reject self URL redirect when content differs', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>original</feed>' },
          'https://self.example.com/feed': {
            body: '<feed>different</feed>',
            url: 'https://redirect.example.com/feed',
          },
        }),
        parser: createMockParser('https://self.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 54: Redirect to URL with authentication
    //
    // When redirect adds authentication credentials to the URL,
    // they should be preserved (credentials are functional).
    it('case 55: should preserve credentials added by redirect', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://user:token@example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body, url: 'https://user:token@example.com/feed' },
          'https://user:token@example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 55: Redirect to URL with non-standard port
    //
    // When redirect adds a non-standard port, it should be preserved.
    it('case 56: should preserve non-standard port from redirect', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com:8443/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body, url: 'https://example.com:8443/feed' },
          'https://example.com:8443/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 56: Variant redirects back to variantSource
    //
    // Input: https://example.com/feed?utm_source=twitter
    // Self URL: https://www.example.com/feed
    // Variant: https://example.com/feed → redirects to https://www.example.com/feed
    // Result: https://www.example.com/feed
    //
    // When a generated variant redirects back to variantSource, that variant should
    // be skipped. Even though https://example.com/feed is "cleaner" (no www), we
    // prefer the non-redirecting URL since choosing the redirecting variant means
    // every future fetch requires a redirect.
    it('case 57: should skip variant that redirects back to variantSource', async () => {
      const value = 'https://example.com/feed?utm_source=twitter'
      const expected = 'https://www.example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed?utm_source=twitter': { body },
          'https://www.example.com/feed': { body },
          'https://example.com/feed': { body, url: 'https://www.example.com/feed' },
        }),
        parser: createMockParser('https://www.example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('self URL protocol retry', () => {
    // Case 57: Self URL HTTPS fails, HTTP works
    //
    // Input: https://example.com/feed
    // Self URL: feed://example.com/rss.xml (resolved to https://example.com/rss.xml)
    // HTTPS version fails, HTTP version works
    //
    // When a feed declares a protocol-ambiguous self URL (e.g., feed://) and the
    // HTTPS resolution fails, the algorithm should try HTTP before falling back
    // to responseUrl.
    it('case 58: should try HTTP when self URL HTTPS fails', async () => {
      const value = 'https://example.com/feed'
      const expected = 'http://example.com/rss.xml'
      const body = '<feed><link rel="self" href="feed://example.com/rss.xml"/></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'http://example.com/rss.xml': { body },
        }),
        parser: createMockParser('feed://example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 58: Self URL HTTP fails, HTTPS works
    //
    // Input: http://example.com/feed
    // Self URL: http://example.com/rss.xml
    // HTTP version fails, HTTPS version works
    //
    // When a feed declares an HTTP self URL but that URL doesn't work,
    // the algorithm should try HTTPS before falling back to responseUrl.
    it('case 59: should try HTTPS when self URL HTTP fails', async () => {
      const value = 'http://example.com/feed'
      const expected = 'https://example.com/rss.xml'
      const body = '<feed><link rel="self" href="http://example.com/rss.xml"/></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body },
          'https://example.com/rss.xml': { body },
        }),
        parser: createMockParser('http://example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 59: Both protocols fail, falls back to responseUrl
    //
    // Input: https://example.com/feed
    // Self URL: feed://other.example.com/rss.xml
    // Both HTTPS and HTTP fail
    //
    // When both protocol versions of selfUrl fail, the algorithm should gracefully
    // fall back to using responseUrl as the variant source.
    it('case 60: should fall back to responseUrl when both protocols fail', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed><link rel="self" href="feed://other.example.com/rss.xml"/></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('feed://other.example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 60: Protocol retry with redirect
    //
    // Input: https://example.com/feed
    // Self URL: feed://cdn.example.com/rss.xml
    // HTTPS fails, HTTP works and redirects to canonical location
    //
    // When HTTP fallback works and redirects, the redirect destination should
    // become the variant source.
    it('case 61: should use redirect destination from HTTP fallback', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/rss.xml'
      const body = '<feed><link rel="self" href="feed://cdn.example.com/rss.xml"/></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'http://cdn.example.com/rss.xml': { body, url: 'https://example.com/rss.xml' },
          'https://example.com/rss.xml': { body },
        }),
        parser: createMockParser('feed://cdn.example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('platform handler edge cases', () => {
    // Case 61: Platform handler normalizes variants
    //
    // Input: https://feeds2.feedburner.com/Example?format=xml
    // Variant: https://feeds.feedburner.com/Example (normalized by platform handler)
    //
    // When variant generation produces URLs that match platform handlers,
    // those handlers should normalize the variants before testing.
    it('case 62: should apply platform handler to generated variants', async () => {
      const value = 'https://feeds2.feedburner.com/Example?format=xml'
      const expected = 'https://feeds.feedburner.com/Example'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://feeds2.feedburner.com/Example?format=xml': { body },
          'https://feeds.feedburner.com/Example': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('response comparison', () => {
    // Case 62: Exact body match (Tier 1)
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/rss.xml (identical body)
    //
    // When bodies are exactly identical, comparison succeeds immediately
    // without needing signature comparison.
    it('case 63: should match when bodies are exactly identical', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/rss.xml'
      const body = '<feed><title>Test</title></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
          'https://example.com/rss.xml': { body },
        }),
        parser: createMockParser('https://example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 63: Signature match with different content (Tier 2)
    //
    // Input: https://example.com/feed (has timestamp in body)
    // Self URL: https://example.com/rss.xml (different timestamp, same signature)
    //
    // When bodies differ but parsed signatures match, the self URL
    // should still be accepted as valid.
    it('case 64: should match when signatures are identical despite different content', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/rss.xml'
      const body1 = '<feed><updated>2024-01-01T00:00:00Z</updated><title>Test</title></feed>'
      const body2 = '<feed><updated>2024-01-02T00:00:00Z</updated><title>Test</title></feed>'
      const signature = { title: 'Test' }
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: body1 },
          'https://example.com/rss.xml': { body: body2 },
        }),
        parser: {
          parse: (body) => body,
          getSelfUrl: () => 'https://example.com/rss.xml',
          getSignature: () => signature,
        },
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 64: Variant matches via signature when content differs (Tier 2)
    //
    // Input: https://www.example.com/feed/ (has cache buster in body)
    // Variant: https://example.com/feed (different cache buster, same signature)
    //
    // When bodies differ but parsed signatures match, the cleaner
    // variant should still win.
    it('case 65: should accept variant when signatures match but content differs', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://example.com/feed'
      const body1 = '<feed><cachebuster>123</cachebuster><title>Test</title></feed>'
      const body2 = '<feed><cachebuster>456</cachebuster><title>Test</title></feed>'
      const signature = { title: 'Test' }
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: body1 },
          'https://example.com/feed': { body: body2 },
        }),
        parser: {
          parse: (body) => body,
          getSelfUrl: () => undefined,
          getSignature: () => signature,
        },
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 65: Signature mismatch rejects URL
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/other (different signature)
    //
    // When both body and signature differ, the URL should be rejected.
    it('case 66: should reject URL when both content and signature differ', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body1 = '<feed><title>Feed A</title></feed>'
      const body2 = '<feed><title>Feed B</title></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: body1 },
          'https://example.com/other': { body: body2 },
        }),
        parser: {
          parse: (body) => body,
          getSelfUrl: () => 'https://example.com/other',
          getSignature: (feed) => ({ title: (feed as string)?.includes('Feed A') ? 'A' : 'B' }),
        },
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('response body edge cases', () => {
    // Case 67: Empty body response
    //
    // When initial fetch returns an empty string body, the parser fails
    // and the algorithm returns undefined (not a valid feed).
    it('case 68: should return undefined for empty body response', async () => {
      const value = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '' },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    // Case 68: Response body is undefined
    //
    // When fetchFn returns undefined body, the parser fails and the
    // algorithm returns undefined (not a valid feed).
    it('case 69: should return undefined for undefined body response', async () => {
      const value = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => ({
          status: 200,
          url,
          body: undefined as unknown as string,
          headers: new Headers(),
        }),
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })

    // Case 69: Self URL equals response URL
    //
    // When self URL exactly matches the response URL, the algorithm should
    // use it directly without additional fetching (optimization path).
    it('case 70: should use response URL when self URL matches exactly', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        fetchFn: async (url) => {
          fetchCalls.push(url)
          return { status: 200, url, body, headers: new Headers() }
        },
        parser: createMockParser('https://example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
      // Should only fetch once (initial fetch), not re-fetch self URL
      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    // Case 70: Self URL is already canonical form
    //
    // When self URL matches what normalization would produce from response URL,
    // no additional fetching is needed.
    it('case 71: should recognize self URL as canonical form of response URL', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://example.com/feed'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('error handling edge cases', () => {
    // Case 71: HTTPS upgrade throws
    //
    // When HTTPS upgrade fetch throws (network error), the algorithm should
    // fall back to HTTP URL gracefully.
    it('case 72: should keep HTTP when HTTPS upgrade throws', async () => {
      const value = 'http://example.com/feed'
      const expected = 'http://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
          if (url.startsWith('https://')) {
            throw new Error('SSL handshake failed')
          }
          return { status: 200, url, body, headers: new Headers() }
        },
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('input URL edge cases', () => {
    // Case 72: Bare domain input URL
    //
    // Input: example.com/feed.xml (no protocol)
    // Result: https://example.com/feed.xml
    //
    // When users paste a URL without protocol, the algorithm should
    // automatically add https:// and proceed with canonicalization.
    it('case 73: should handle bare domain input URL', async () => {
      const value = 'example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 73: Protocol-relative input URL
    //
    // Input: //example.com/feed.xml
    // Result: https://example.com/feed.xml
    //
    // Protocol-relative URLs should default to HTTPS.
    it('case 74: should handle protocol-relative input URL', async () => {
      const value = '//example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 74: Invalid/malformed input URL
    //
    // Input: not a url at all :::
    // Result: undefined
    //
    // Completely invalid URLs should return undefined immediately
    // without attempting any fetch.
    it('case 75: should return undefined for invalid input URL', async () => {
      const value = 'not a url at all :::'
      const fetchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
          fetchCalls.push(url)
          return { status: 200, url, body: '<feed/>', headers: new Headers() }
        },
      }

      expect(await canonicalize(value, options)).toBeUndefined()
      expect(fetchCalls).toEqual([])
    })

    // Case 75: file:// scheme input URL
    //
    // Input: file:///etc/passwd
    // Result: undefined
    //
    // Non-HTTP schemes should be rejected immediately.
    it('case 76: should return undefined for file:// scheme', async () => {
      const value = 'file:///etc/passwd'
      const fetchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: async (url) => {
          fetchCalls.push(url)
          return { status: 200, url, body: '<feed/>', headers: new Headers() }
        },
      }

      expect(await canonicalize(value, options)).toBeUndefined()
      expect(fetchCalls).toEqual([])
    })

    // Case 76: Input URL with tracking params
    //
    // Input: https://example.com/feed?utm_source=twitter&utm_medium=social
    // Result: https://example.com/feed (stripped)
    //
    // When input URL contains tracking params and the clean variant works,
    // the clean variant should be returned.
    it('case 77: should strip tracking params from input URL when variant works', async () => {
      const value = 'https://example.com/feed?utm_source=twitter&utm_medium=social'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed?utm_source=twitter&utm_medium=social': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser(undefined),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('self URL validation edge cases', () => {
    // Case 77: Self URL returns empty body
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/rss.xml (returns 200 but empty body)
    // Result: https://example.com/feed
    //
    // When self URL fetch succeeds but returns empty body, comparison
    // should fail and fall back to responseUrl.
    it('case 78: should reject self URL when it returns empty body', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>content</feed>' },
          'https://example.com/rss.xml': { body: '' },
        }),
        parser: createMockParser('https://example.com/rss.xml'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 78: Protocol fallback - second protocol returns different content
    //
    // Input: https://example.com/feed
    // Self URL: https://other.example.com/rss (404) → try http:// (200 but different)
    // Result: https://example.com/feed
    //
    // When HTTPS self URL fails and HTTP fallback returns different content,
    // both are rejected and responseUrl is used.
    it('case 79: should reject self URL when both protocols fail to match', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>original</feed>' },
          'https://other.example.com/rss': { status: 404 },
          'http://other.example.com/rss': { body: '<feed>different</feed>' },
        }),
        parser: createMockParser('https://other.example.com/rss'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })

    // Case 79: Self URL redirects to invalid URL
    //
    // Input: https://example.com/feed
    // Self URL: https://self.example.com/rss → redirects to file:///invalid
    // Result: https://example.com/feed
    //
    // When self URL redirects to a non-HTTP URL, prepareUrl returns undefined
    // and we fall back to responseUrl.
    it('case 80: should reject self URL when redirect destination is invalid', async () => {
      const value = 'https://example.com/feed'
      const expected = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        fetchFn: async (url) => {
          if (url === 'https://example.com/feed') {
            return { status: 200, url, body, headers: new Headers() }
          }
          if (url === 'https://self.example.com/rss') {
            return { status: 200, url: 'file:///invalid', body, headers: new Headers() }
          }
          throw new Error(`Unexpected fetch: ${url}`)
        },
        parser: createMockParser('https://self.example.com/rss'),
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('variant comparison edge cases', () => {
    // Case 80: Variant parse returns undefined - skip to next variant
    //
    // When parser.parse returns undefined on a variant's body, comparison
    // should fail and that variant should be skipped.
    it('case 81: should skip variant when parser.parse returns undefined on compared body', async () => {
      const value = 'https://www.example.com/feed/'
      const expected = 'https://www.example.com/feed'
      const validBody = '<feed><valid>true</valid></feed>'
      const unparseable = '<nope>not a feed</nope>'
      const options: CanonicalizeOptions = {
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
          getSignature: (feed) => ({ content: feed }),
        },
        tiers: [
          { stripWww: true, stripTrailingSlash: true },
          { stripWww: false, stripTrailingSlash: true },
        ],
      }

      expect(await canonicalize(value, options)).toBe(expected)
    })
  })

  describe('platform handler edge cases (continued)', () => {
    // Case 81: Response URL invalid after platform handler
    //
    // When initial fetch succeeds but the response URL becomes invalid
    // after platform handler processing, return undefined.
    it('case 82: should return undefined when response URL is invalid after platform handler', async () => {
      const value = 'https://example.com/feed'
      const badHandler: PlatformHandler = {
        match: () => true,
        normalize: () => {
          // Return a URL object that will fail when converted to href
          // by mocking a broken URL
          return new URL('file:///invalid')
        },
      }
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed/>' },
        }),
        platforms: [badHandler],
      }

      expect(await canonicalize(value, options)).toBeUndefined()
    })
  })

  describe('with onFetch callback', () => {
    it('should call onFetch for initial fetch', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      const fetchCalls: Array<{ url: string; status: number }> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        onFetch: (data) => {
          fetchCalls.push({
            url: data.url,
            status: data.response.status,
          })
        },
      }

      await canonicalize(value, options)

      expect(fetchCalls).toEqual([{ url: 'https://example.com/feed', status: 200 }])
    })

    it('should call onFetch for each variant attempt', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { body },
        }),
        onFetch: (data) => {
          fetchCalls.push(data.url)
        },
      }

      await canonicalize(value, options)

      expect(fetchCalls).toEqual(['https://www.example.com/feed/', 'https://example.com/feed'])
    })

    it('should call onFetch for failed requests', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const fetchCalls: Array<{ url: string; status: number }> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { body: '', status: 404 },
        }),
        onFetch: (data) => {
          fetchCalls.push({
            url: data.url,
            status: data.response.status,
          })
        },
      }

      await canonicalize(value, options)

      expect(fetchCalls).toEqual([
        { url: 'https://www.example.com/feed/', status: 200 },
        { url: 'https://example.com/feed', status: 404 },
      ])
    })

    it('should propagate error when onFetch throws', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        onFetch: () => {
          throw new Error('Callback error')
        },
      }

      expect(canonicalize(value, options)).rejects.toThrow('Callback error')
    })
  })

  describe('with onMatch callback', () => {
    it('should call onMatch for initial response', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      const matchCalls: Array<{ url: string; body: string }> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        onMatch: (data) => {
          matchCalls.push({
            url: data.url,
            body: data.response.body,
          })
        },
      }

      await canonicalize(value, options)

      expect(matchCalls).toEqual([{ url: 'https://example.com/feed', body }])
    })

    it('should not call onMatch when parsing fails', async () => {
      const value = 'https://example.com/feed'
      const matchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: {
          parse: () => undefined,
          getSelfUrl: () => undefined,
          getSignature: () => ({}),
        },
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: 'not a valid feed' },
        }),
        onMatch: (data) => {
          matchCalls.push(data.url)
        },
      }

      const result = await canonicalize(value, options)

      expect(result).toBeUndefined()
      expect(matchCalls).toEqual([])
    })

    it('should call onMatch for self URL validation', async () => {
      const value = 'https://cdn.example.com/feed'
      const body = '<feed></feed>'
      const matchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        fetchFn: createMockFetch({
          'https://cdn.example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        parser: createMockParser('https://example.com/feed'),
        onMatch: (data) => {
          matchCalls.push(data.url)
        },
      }

      await canonicalize(value, options)

      expect(matchCalls).toEqual(['https://cdn.example.com/feed', 'https://example.com/feed'])
    })

    it('should call onMatch for variant match', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const matchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
          'https://example.com/feed': { body },
        }),
        onMatch: (data) => {
          matchCalls.push(data.url)
        },
      }

      await canonicalize(value, options)

      expect(matchCalls).toEqual(['https://www.example.com/feed/', 'https://example.com/feed'])
    })

    it('should call onMatch for HTTPS upgrade', async () => {
      const value = 'http://example.com/feed'
      const body = '<feed></feed>'
      const matchCalls: Array<string> = []
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'http://example.com/feed': { body },
          'https://example.com/feed': { body },
        }),
        onMatch: (data) => {
          matchCalls.push(data.url)
        },
      }

      await canonicalize(value, options)

      expect(matchCalls).toEqual(['http://example.com/feed', 'https://example.com/feed'])
    })

    it('should include full response and feed in onMatch', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      let matchData: { url: string; response: FetchFnResponse; feed: unknown } | undefined
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        onMatch: (data) => {
          matchData = data
        },
      }

      await canonicalize(value, options)

      expect(matchData).toEqual({
        url: value,
        response: { body, url: value, status: 200, headers: new Headers() },
        feed: body,
      })
    })

    it('should propagate error when onMatch throws', async () => {
      const value = 'https://example.com/feed'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://example.com/feed': { body },
        }),
        onMatch: () => {
          throw new Error('Callback error')
        },
      }

      expect(canonicalize(value, options)).rejects.toThrow('Callback error')
    })
  })

  describe('with onExists callback', () => {
    it('should call onExists when existsFn finds match with data', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const existingData = { id: 123, savedAt: '2024-01-01' }
      let existsCallData: { url: string; data: unknown } | undefined
      const options: CanonicalizeOptions = {
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
        onExists: (data) => {
          existsCallData = data
        },
      }

      await canonicalize(value, options)

      expect(existsCallData).toEqual({ url: 'https://example.com/feed', data: existingData })
    })

    it('should propagate error when onExists throws', async () => {
      const value = 'https://www.example.com/feed/'
      const body = '<feed></feed>'
      const options: CanonicalizeOptions = {
        parser: createMockParser(undefined),
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body },
        }),
        existsFn: async (url) => (url === 'https://example.com/feed' ? { id: 55 } : undefined),
        onExists: () => {
          throw new Error('Callback error')
        },
      }

      expect(canonicalize(value, options)).rejects.toThrow('Callback error')
    })
  })
})
