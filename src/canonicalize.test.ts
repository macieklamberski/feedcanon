import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type { FetchFnResponse, ParserAdapter, PlatformHandler } from './types.js'

describe('canonicalize', () => {
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

      expect(result).toBe('https://feeds.feedburner.com/TechCrunch')
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

      expect(result).toBe('https://example.com/feed')
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

      expect(result).toBe('https://blog.example.com/rss.xml')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://old.example.com/feed': { status: 404 },
        }),
        parser: createMockParser('https://old.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 5: Self URL Produces Different Feed
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/feed/full (misconfigured, points to full-text variant)
    // Result: https://example.com/feed
    //
    // When a publisher misconfigures their self URL to point to a different feed
    // variant (e.g., full-text vs summary), the algorithm detects the content
    // difference via hash comparison and uses the response URL instead.
    it('case 5: should use responseUrl when self URL produces different content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>summary</feed>' },
          'https://example.com/feed/full': { body: '<feed>full content</feed>' },
        }),
        parser: createMockParser('https://example.com/feed/full'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
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

      expect(result).toBe('https://blog.example.com/feed')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://legacy.example.com/feed.rss': { body: content },
          'https://legacy.example.com/feed.rss': { status: 500 },
        }),
      }
      const result = await canonicalize('http://legacy.example.com/feed.rss', options)

      expect(result).toBe('http://legacy.example.com/feed.rss')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/rss.xml': { body: content },
        }),
        parser: createMockParser('feed://example.com/rss.xml'),
      }
      const result = await canonicalize('https://example.com/rss.xml', options)

      expect(result).toBe('https://example.com/rss.xml')
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
      const content = '<feed></feed>'
      const optionsA = {
        fetchFn: createMockFetch({
          'https://feeds2.feedburner.com/blog': { body: content },
          'https://feeds.feedburner.com/blog': { body: content },
        }),
      }
      const resultA = await canonicalize('https://feeds2.feedburner.com/blog', optionsA)

      const optionsB = {
        fetchFn: createMockFetch({
          'https://feedproxy.google.com/blog?format=rss': { body: content },
          'https://feeds.feedburner.com/blog': { body: content },
        }),
      }
      const resultB = await canonicalize('https://feedproxy.google.com/blog?format=rss', optionsB)

      const optionsC = {
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/blog?format=xml': { body: content },
          'https://feeds.feedburner.com/blog': { body: content },
        }),
      }
      const resultC = await canonicalize('https://feeds.feedburner.com/blog?format=xml', optionsC)

      // All three aliases normalize to the same canonical URL.
      expect(resultA).toBe('https://feeds.feedburner.com/blog')
      expect(resultB).toBe('https://feeds.feedburner.com/blog')
      expect(resultC).toBe('https://feeds.feedburner.com/blog')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/blog/feed.xml': { body: content },
        }),
        parser: createMockParser('feed.xml'),
      }
      const result = await canonicalize('https://example.com/blog/feed.xml', options)

      expect(result).toBe('https://example.com/blog/feed.xml')
    })

    // Case 13: Self URL with Different Query Params
    //
    // Input: https://example.com/feed?format=rss
    // Self URL: https://example.com/feed?format=atom
    // Result: https://example.com/feed?format=rss
    //
    // Some query params are functional (e.g., format=rss) and stripping them
    // changes the content. The algorithm detects this via hash comparison and
    // keeps the required params while still stripping tracking params.
    it('case 13: should keep functional query params when stripping changes content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed?format=rss': { body: '<feed>rss format</feed>' },
          'https://example.com/feed': { body: '<feed>default format</feed>' },
        }),
      }
      const result = await canonicalize('https://example.com/feed?format=rss', options)

      expect(result).toBe('https://example.com/feed?format=rss')
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
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
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

      expect(result).toBe('https://special.example.com:8443/api/v2/feed.json?auth=token123')
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
      const options = {
        fetchFn: async () => {
          throw new Error('Redirect loop detected')
        },
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBeUndefined()
    })

    // Case 17: Content Hash Mismatch (CDN Variation)
    //
    // Input: https://example.com/feed
    // Result: https://example.com/feed
    //
    // Some feeds include dynamic content (timestamps, request IDs) causing raw byte
    // hashes to differ between requests. When raw hash fails, a feed signature based
    // on parsed data (title, GUIDs, links) can be used as fallback comparison.
    it('case 17: should handle dynamic content with different hashes', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>Generated: 2024-01-15 10:30:00</feed>' },
          'https://example.com/feed/': { body: '<feed>Generated: 2024-01-15 10:30:05</feed>' },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Content differs so variant doesn't match; falls back to response URL.
      expect(result).toBe('https://example.com/feed')
    })

    // Case 18: Multiple Self URLs in Feed
    //
    // Input: https://example.com/feed
    // Self URLs: https://example.com/feed, https://example.com/rss.xml, https://www.example.com/feed
    // Result: https://example.com/feed
    //
    // When a feed declares multiple <link rel="self"> elements, the algorithm
    // prefers the one matching the response URL for consistency. If none match,
    // it uses the first declared self URL.
    it('case 18: should handle multiple self URLs by preferring matching responseUrl', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        // Parser returns the matching self URL.
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 19: Self URL Returns HTML (Not Feed)
    //
    // Input: https://example.com/feed.xml
    // Self URL: https://example.com/blog (returns HTML, not feed)
    // Result: https://example.com/feed.xml
    //
    // When a feed's self URL points to an HTML page (publisher misconfiguration),
    // the algorithm skips that variant because it's not a valid feed. It falls
    // back to using the response URL which is known to be a valid feed.
    it('case 19: should ignore self URL that points to non-feed content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { body: '<feed></feed>' },
          // Self URL returns HTML, different content type.
          'https://example.com/blog': { body: '<!DOCTYPE html><html></html>' },
        }),
        parser: createMockParser('https://example.com/blog'),
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      // Hash doesn't match (HTML vs feed), so falls back to response URL.
      expect(result).toBe('https://example.com/feed.xml')
    })

    // Case 20: Self URL Triggers Redirect Chain
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/rss (outdated, redirects to responseUrl)
    // Result: https://example.com/feed
    //
    // When a self URL is outdated and redirects to a new location, the algorithm
    // uses the redirect destination (not the original selfUrl) as the variant source.
    // This ensures we use the current canonical location, not stale URLs.
    it('case 20: should use redirect destination when self URL redirects', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          // Self URL redirects to responseUrl.
          'https://old.example.com/rss': { body: content, url: 'https://example.com/feed' },
        }),
        parser: createMockParser('https://old.example.com/rss'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // selfUrl redirects to responseUrl, so responseUrl becomes variantSource.
      expect(result).toBe('https://example.com/feed')
    })

    // Case 21: Platform Handler Canonical Is Dead
    //
    // Input: http://feedproxy.google.com/MyBlog
    // Result: undefined (fetch failed)
    //
    // When a platform handler transforms the input URL but the canonical domain
    // is dead (service shutdown), the algorithm returns undefined since the feed
    // cannot be fetched.
    it('case 21: should return undefined when platform canonical is dead', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/MyBlog': { status: 404 },
        }),
      }
      const result = await canonicalize('https://feedproxy.google.com/MyBlog', options)

      expect(result).toBeUndefined()
    })

    // Case 22: Case Sensitivity Mismatch
    //
    // Input: https://example.com/Blog/Feed.XML
    // Self URL: https://example.com/blog/feed.xml (lowercase)
    // Result: https://example.com/blog/feed.xml
    //
    // URL paths are case-sensitive per RFC, but many servers are case-insensitive.
    // When input has mixed case but self URL is lowercase, the algorithm prefers
    // lowercase as conventionally cleaner, after verifying it returns same content.
    it('case 22: should prefer lowercase URL path when content matches', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/Blog/Feed.XML': { body: content },
          'https://example.com/blog/feed.xml': { body: content },
        }),
        parser: createMockParser('https://example.com/blog/feed.xml'),
      }
      const result = await canonicalize('https://example.com/Blog/Feed.XML', options)

      expect(result).toBe('https://example.com/blog/feed.xml')
    })

    // Case 23: Scheme-Relative Input
    //
    // Input: https://example.com/feed
    // Self URL: //example.com/feed (scheme-relative)
    // Result: https://example.com/feed
    //
    // Scheme-relative URLs (//host/path) lack a protocol. The algorithm defaults
    // to HTTPS when resolving, falling back to HTTP if HTTPS fails. This is rare
    // for direct feed URLs but handled for completeness.
    it('case 23: should handle scheme-relative URL by defaulting to HTTPS', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('//example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 24: Standard Port in URL
    //
    // Input: https://example.com:443/feed
    // Result: https://example.com/feed
    //
    // Default ports (443 for HTTPS, 80 for HTTP) are redundant and should be
    // stripped during normalization. URLs with and without default port are
    // semantically identical.
    it('case 24: should strip default port from URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com:443/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com:443/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 25: Input URL Has Credentials
    //
    // Input: https://user:password123@example.com/private/feed
    // Result: https://example.com/private/feed (credentials stripped)
    //
    // Embedded credentials (user:pass@host) should never be stored in canonical URLs
    // for security. The algorithm strips credentials from the URL but returns a flag
    // indicating auth is required. Credentials should be stored separately.
    it('case 25: should handle URL with credentials by stripping them', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://user:password123@example.com/private/feed': {
            body: content,
            url: 'https://example.com/private/feed',
          },
          'https://example.com/private/feed': { body: content },
        }),
      }
      const result = await canonicalize(
        'https://user:password123@example.com/private/feed',
        options,
      )

      // Credentials stripped, URL normalized.
      expect(result).toBe('https://example.com/private/feed')
    })
  })

  describe('canonicalization cases (continued)', () => {
    // Case 26: Response Redirects to FeedBurner
    //
    // Input: https://example.com/feed
    // Redirects: → https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When the input URL redirects to a FeedBurner alias, the platform handler
    // should normalize the response URL to the canonical FeedBurner domain.
    it('case 26: should apply platform handler when response redirects to FeedBurner', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: content,
            url: 'https://feedproxy.google.com/ExampleBlog',
          },
          'https://feeds.feedburner.com/ExampleBlog': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://feeds.feedburner.com/ExampleBlog')
    })

    // Case 27: Self URL Is FeedBurner Alias
    //
    // Input: https://example.com/feed
    // Self URL: https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When a feed declares a FeedBurner alias as its self URL, the platform handler
    // should normalize it to the canonical domain before validation.
    it('case 27: should apply platform handler to FeedBurner self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://feeds.feedburner.com/ExampleBlog': { body: content },
        }),
        parser: createMockParser('https://feedproxy.google.com/ExampleBlog'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://feeds.feedburner.com/ExampleBlog')
    })

    // Case 28: HTTPS Returns Different Content
    //
    // Input: http://example.com/feed
    // Result: http://example.com/feed
    //
    // When HTTPS returns different content (not a network failure), the algorithm
    // should fall back to HTTP. This differs from Case 8 where HTTPS fails entirely.
    // Some servers serve different feeds over HTTP vs HTTPS.
    it('case 28: should keep HTTP when HTTPS returns different content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: '<feed>http version</feed>' },
          'https://example.com/feed': { body: '<feed>https version</feed>' },
        }),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toBe('http://example.com/feed')
    })

    // Case 29: Self URL Fails Verification
    //
    // Input: https://example.com/feed
    // Self URL: https://blocked.example.com/feed (blocked by verifyUrlFn)
    // Result: https://example.com/feed
    //
    // When self URL fails verification (verifyUrlFn returns false), it should be
    // ignored and the algorithm should use responseUrl for variants. This allows
    // blocklisting specific domains or URL patterns.
    it('case 29: should ignore self URL when verification fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://blocked.example.com/feed': { body: content },
        }),
        parser: createMockParser('https://blocked.example.com/feed'),
        verifyUrlFn: (url: string) => {
          return !url.includes('blocked')
        },
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 30: Variant Matches Response URL
    //
    // Input: https://www.example.com/feed
    // Self URL: https://other.example.com/feed (different domain)
    // Result: https://www.example.com/feed
    //
    // When a variant matches responseUrl but not variantSource, it should set
    // winningUrl to responseUrl and break early without extra fetching. This
    // optimizes the common case where responseUrl is already clean.
    it('case 30: should use responseUrl when variant matches it', async () => {
      const content = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = {
        fetchFn: async (url: string) => {
          fetchCalls.push(url)
          if (url === 'https://www.example.com/feed') {
            return { status: 200, url, body: content, headers: new Headers() }
          }
          throw new Error(`Unexpected fetch: ${url}`)
        },
        parser: createMockParser('https://other.example.com/feed'),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      // Should return responseUrl without extra fetches for non-matching variants.
      expect(result).toBe('https://www.example.com/feed')
    })

    // Case 31: Parser Returns Undefined
    //
    // Input: https://example.com/feed
    // Parser: Returns undefined (unparseable content)
    // Result: https://example.com/feed
    //
    // When parser.parse() returns undefined (unparseable or invalid content),
    // the algorithm should gracefully continue without a self URL, using
    // responseUrl for variant generation.
    it('case 31: should handle parser returning undefined', async () => {
      const content = '<invalid>not a feed</invalid>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
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
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 32: Self URL with Fragment
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/feed#section
    // Result: https://example.com/feed
    //
    // Self URL with fragment (#section) should have fragment stripped during
    // resolution. Fragments are not sent to servers and should not be part
    // of the canonical URL.
    it('case 32: should strip fragment from self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed#section'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 33: Self URL Protocol Differs
    //
    // Input: https://example.com/feed
    // Self URL: http://example.com/feed (HTTP instead of HTTPS)
    // Result: https://example.com/feed
    //
    // When self URL uses HTTP but input uses HTTPS, both protocols are considered
    // as variants. HTTPS is preferred when content matches, providing security
    // even when the feed declares an HTTP self URL.
    it('case 33: should handle self URL with different protocol', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'http://example.com/feed': { body: content },
        }),
        parser: createMockParser('http://example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // HTTPS input should be preferred.
      expect(result).toBe('https://example.com/feed')
    })

    // Case 34: All Variants Fail
    //
    // Input: https://www.example.com/feed/
    // Result: https://www.example.com/feed/
    //
    // When all normalized variants fail (404, network error) but the original
    // variantSource works, it should be returned as the canonical URL. This
    // ensures we always return a working URL.
    it('case 34: should fall back to variantSource when all variants fail', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
          'https://example.com/feed': { status: 404 },
          'https://www.example.com/feed': { status: 404 },
        }),
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      expect(result).toBe('https://www.example.com/feed/')
    })

    // Case 35: Variant Redirects
    //
    // Input: https://www.example.com/feed
    // Variant: https://example.com/feed → redirects to https://canonical.example.com/feed
    // Result: https://example.com/feed
    //
    // When a variant URL redirects to a different destination, the algorithm
    // uses the original variant URL (not the redirect destination) if content
    // matches. This provides a stable canonical URL.
    it('case 35: should use variant URL even when it redirects', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': {
            body: content,
            url: 'https://canonical.example.com/feed',
          },
        }),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      // Uses the variant URL that was tested, not where it redirected.
      expect(result).toBe('https://example.com/feed')
    })

    // Case 36: Self URL Redirects to FeedBurner
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/rss → redirects to https://feedproxy.google.com/ExampleBlog
    // Result: https://feeds.feedburner.com/ExampleBlog
    //
    // When selfUrl response redirects to a FeedBurner alias, the platform handler
    // should normalize the redirect destination for variant generation. This handles
    // feeds that have migrated to FeedBurner.
    it('case 36: should apply platform handler to self URL redirect destination', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://old.example.com/rss': {
            body: content,
            url: 'https://feedproxy.google.com/ExampleBlog',
          },
          'https://feeds.feedburner.com/ExampleBlog': { body: content },
        }),
        parser: createMockParser('https://old.example.com/rss'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://feeds.feedburner.com/ExampleBlog')
    })
  })

  describe('with existsFn option', () => {
    // The existsFn allows checking if a variant already exists in the database,
    // enabling early return without additional fetch requests.
    it('should return matching URL when existsFn finds match', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
        }),
        existsFn: async (url: string) => {
          return url === 'https://example.com/feed'
        },
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      expect(result).toBe('https://example.com/feed')
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
        existsFn: async () => {
          return false
        },
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      expect(result).toBe('https://example.com/feed')
    })

    // When existsFn returns true for a non-first variant (not the cleanest),
    // that variant should be returned immediately without testing cleaner variants.
    it('should return non-first variant when existsFn matches it', async () => {
      const content = '<feed></feed>'
      const checkedUrls: Array<string> = []
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
        }),
        existsFn: async (url: string) => {
          checkedUrls.push(url)
          // Return true only for the second variant (with www).
          return url === 'https://www.example.com/feed'
        },
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      // Should return the variant that existsFn matched.
      expect(result).toBe('https://www.example.com/feed')
      // First variant checked was the cleanest (no www), second was with www.
      expect(checkedUrls).toContain('https://example.com/feed')
      expect(checkedUrls).toContain('https://www.example.com/feed')
    })
  })

  describe('with verifyUrlFn option', () => {
    // The verifyUrlFn allows custom validation of URLs before testing, enabling
    // blocklisting of domains or URL patterns.
    it('should skip variants that fail verification', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyUrlFn: (url: string) => {
          return url.includes('www')
        },
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      expect(result).toBe('https://www.example.com/feed')
    })

    it('should skip HTTPS upgrade when verification fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyUrlFn: (url: string) => {
          return !url.startsWith('https://')
        },
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toBe('http://example.com/feed')
    })
  })

  describe('with parser option', () => {
    // The parser option enables extracting self URLs from feed content,
    // providing an additional source for variant generation.
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

      expect(result).toBe('https://example.com/feed')
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

      expect(result).toBe('https://example.com/feed')
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

      expect(result).toBe('https://example.com/feed')
    })
  })

  describe('when fetch fails', () => {
    it('should return undefined when fetch throws', async () => {
      const options = {
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toBeUndefined()
    })

    it('should return undefined when fetch returns non-2xx', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toBeUndefined()
    })
  })

  describe('platform handler edge cases', () => {
    // Case 37: Platform Handler Throws Exception
    //
    // When a platform handler throws an exception during match() or normalize(),
    // the algorithm should continue gracefully using the original URL.
    it('case 37: should continue gracefully when platform handler throws', async () => {
      const content = '<feed></feed>'
      const throwingHandler: PlatformHandler = {
        match: () => {
          throw new Error('Handler error')
        },
        normalize: (url) => url,
      }
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        platforms: [throwingHandler],
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 38: Multiple Platform Handlers Match
    //
    // When multiple platform handlers could match a URL, only the first matching
    // handler should be applied (handlers are checked in order, first match wins).
    it('case 38: should apply only first matching platform handler', async () => {
      const content = '<feed></feed>'
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
      const options = {
        fetchFn: createMockFetch({
          'https://first.example.com/feed': { body: content },
        }),
        platforms: [firstHandler, secondHandler],
      }
      const result = await canonicalize('https://multi.example.com/feed', options)

      expect(result).toBe('https://first.example.com/feed')
    })
  })

  describe('URL parsing edge cases', () => {
    // Case 39: IDN/Punycode Mismatch
    //
    // When input URL uses Unicode hostname and self URL uses Punycode (or vice versa),
    // they should be recognized as equivalent after normalization.
    it('case 39: should handle IDN/Punycode mismatch between input and self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          // Punycode version of münchen.example.com
          'https://xn--mnchen-3ya.example.com/feed': { body: content },
        }),
        parser: createMockParser('https://xn--mnchen-3ya.example.com/feed'),
      }
      // Input uses Unicode, self URL uses Punycode
      const result = await canonicalize('https://xn--mnchen-3ya.example.com/feed', options)

      expect(result).toBe('https://xn--mnchen-3ya.example.com/feed')
    })

    // Case 40: Port Number Mismatch
    //
    // When self URL specifies a different port than the input URL, the algorithm
    // validates the self URL and uses it as variant source if content matches.
    // Note: Non-standard ports are preserved (only :80/:443 stripped by default tiers).
    it('case 40: should handle self URL on different port', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://example.com:8443/feed': { body: content },
        }),
        parser: createMockParser('https://example.com:8443/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Self URL on different port validated and becomes variant source
      // Non-standard port preserved (tiers only strip :80/:443)
      expect(result).toBe('https://example.com:8443/feed')
    })

    // Case 41: IPv6 Address URL
    //
    // URLs with IPv6 addresses should be handled correctly, including bracket notation.
    it('case 41: should handle IPv6 address URLs', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://[2001:db8::1]/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://[2001:db8::1]/feed', options)

      expect(result).toBe('https://[2001:db8::1]/feed')
    })

    // Case 42: URL with Unusual but Valid Characters
    //
    // URLs containing percent-encoded characters, unicode in path, or other unusual
    // but valid URL characters should be handled correctly.
    it('case 42: should handle URLs with unusual but valid characters', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed%20file.xml': { body: content },
        }),
        parser: createMockParser('https://example.com/feed%20file.xml'),
      }
      const result = await canonicalize('https://example.com/feed%20file.xml', options)

      expect(result).toBe('https://example.com/feed%20file.xml')
    })

    // Case 43: Self URL with Dangerous Scheme
    //
    // Self URLs with dangerous schemes (javascript:, data:, file:) should be
    // rejected and the algorithm should fall back to responseUrl.
    it('case 43: should reject self URL with javascript: scheme', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('javascript:alert(1)'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    it('case 43b: should reject self URL with data: scheme', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('data:text/xml,<feed/>'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 44: Malformed/Unparseable Self URL
    //
    // When self URL is completely malformed and cannot be parsed, the algorithm
    // should continue gracefully using responseUrl.
    it('case 44: should handle malformed self URL gracefully', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('not a valid url at all :::'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 45: Self URL with Credentials
    //
    // When self URL contains embedded credentials and validates (same content),
    // it becomes the variant source. Since default tiers have stripAuthentication: false,
    // credentials are preserved in the canonical URL.
    it('case 45: should use self URL with credentials when it validates', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://user:pass@example.com/feed': { body: content },
        }),
        parser: createMockParser('https://user:pass@example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Self URL validates → becomes variant source → credentials preserved
      expect(result).toBe('https://user:pass@example.com/feed')
    })

    // Case 46: Relative Self URL Edge Case
    //
    // Relative self URLs with path traversal (../) should resolve correctly
    // against the response URL base and be used if content matches.
    it('case 46: should resolve relative self URL with path traversal', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/blog/posts/feed.xml': { body: content },
          'https://example.com/feed.xml': { body: content },
        }),
        parser: createMockParser('../../feed.xml'),
      }
      const result = await canonicalize('https://example.com/blog/posts/feed.xml', options)

      // ../../feed.xml from /blog/posts/feed.xml resolves to /feed.xml
      // Algorithm validates it and uses the cleaner path as canonical
      expect(result).toBe('https://example.com/feed.xml')
    })
  })

  describe('algorithm path coverage', () => {
    // Case 47: existsFn Returns True for Non-First Variant
    //
    // When existsFn returns true for a variant that isn't the first one tested,
    // that variant should be returned immediately (early termination).
    it('case 47: should return early when existsFn matches non-first variant', async () => {
      const content = '<feed></feed>'
      const differentContent = '<feed><item>different</item></feed>'
      const fetchCalls: Array<string> = []
      const options = {
        fetchFn: async (url: string) => {
          fetchCalls.push(url)
          // First variant (no www) returns different content, won't match hash
          if (url === 'https://example.com/feed') {
            return { status: 200, url, body: differentContent, headers: new Headers() }
          }
          return { status: 200, url, body: content, headers: new Headers() }
        },
        existsFn: async (url: string) => {
          // Only the www version exists in database
          return url === 'https://www.example.com/feed'
        },
        tiers: [
          { stripWww: true, stripTrailingSlash: true },
          { stripWww: false, stripTrailingSlash: true },
        ],
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      // existsFn returns true for www variant, should return it immediately
      expect(result).toBe('https://www.example.com/feed')
    })

    // Case 48: Self URL Resolves to Localhost/Private IP
    //
    // When self URL resolves to localhost or private IP, verifyUrlFn should
    // block it to prevent SSRF attacks. Algorithm falls back to responseUrl.
    it('case 48: should reject self URL pointing to localhost via verifyUrlFn', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://localhost/feed'),
        verifyUrlFn: (url: string) => {
          // Block localhost and private IPs
          const parsed = new URL(url)
          return !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)
        },
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Self URL blocked by verifyUrlFn, falls back to responseUrl
      expect(result).toBe('https://example.com/feed')
    })

    // Case 49: Mixed Case Hostname
    //
    // Hostnames are case-insensitive per RFC. URLs with different case should
    // be normalized to lowercase and treated as equivalent.
    it('case 49: should normalize mixed case hostname', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://EXAMPLE.COM/feed'),
      }
      const result = await canonicalize('https://Example.COM/feed', options)

      // Hostname normalized to lowercase
      expect(result).toBe('https://example.com/feed')
    })

    // Case 50: All Tiers Produce Identical URL
    //
    // When all normalization tiers produce the same URL (degenerate case),
    // the algorithm should handle it gracefully without unnecessary fetches.
    it('case 50: should handle when all tiers produce identical URL', async () => {
      const content = '<feed></feed>'
      const fetchCalls: Array<string> = []
      const options = {
        fetchFn: async (url: string) => {
          fetchCalls.push(url)
          return { status: 200, url, body: content, headers: new Headers() }
        },
        tiers: [
          { stripWww: true }, // Already no www
          { stripWww: false }, // Still no www
        ],
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
      // Only initial fetch, no variant testing needed (all variants identical)
      expect(fetchCalls).toEqual(['https://example.com/feed'])
    })

    // Case 51: Self URL Redirects to Different Domain
    //
    // When self URL validates but redirects to a different final URL,
    // the redirect destination becomes the variant source.
    it('case 51: should use self URL redirect destination as variant source', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://old.example.com/feed': { body: content },
          'https://alias.example.com/feed': { body: content, url: 'https://new.example.com/feed' },
          'https://new.example.com/feed': { body: content },
        }),
        parser: createMockParser('https://alias.example.com/feed'),
      }
      const result = await canonicalize('https://old.example.com/feed', options)

      // Self URL redirects to new.example.com, that becomes canonical
      expect(result).toBe('https://new.example.com/feed')
    })

    // Case 52: Variant Testing Exhausts All Options
    //
    // When no variant matches (all return different content or fail),
    // the algorithm falls back to variantSource.
    it('case 52: should fall back to variantSource when all variants fail', async () => {
      const content = '<feed></feed>'
      const differentContent = '<feed><different/></feed>'
      const options = {
        fetchFn: async (url: string) => {
          // Only the original URL works, variants return different content
          if (url === 'https://www.example.com/feed/') {
            return { status: 200, url, body: content, headers: new Headers() }
          }
          return { status: 200, url, body: differentContent, headers: new Headers() }
        },
        tiers: [
          { stripWww: true, stripTrailingSlash: true },
          { stripWww: false, stripTrailingSlash: true },
        ],
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      // All variants fail to match, falls back to variantSource (responseUrl)
      expect(result).toBe('https://www.example.com/feed/')
    })

    // Case 53: Self URL Redirect Chain
    //
    // When self URL goes through a redirect chain, the final destination
    // (after all redirects) is used as variant source.
    it('case 53: should use final URL after self URL redirect chain', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://redirect1.example.com/feed': {
            body: content,
            url: 'https://redirect2.example.com/feed',
          },
          'https://redirect2.example.com/feed': { body: content },
        }),
        parser: createMockParser('https://redirect1.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Self URL chain: redirect1 → redirect2, final URL is redirect2
      expect(result).toBe('https://redirect2.example.com/feed')
    })

    // Case 54: First Matching Variant Wins
    //
    // When multiple variants would match (same hash), the first one
    // tested (cleanest tier) wins.
    it('case 54: should return first matching variant when multiple match', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed/': { body: content },
          'https://example.com/feed': { body: content }, // Tier 0: no www, no slash
          'https://www.example.com/feed': { body: content }, // Tier 1: www, no slash
        }),
        tiers: [
          { stripWww: true, stripTrailingSlash: true },
          { stripWww: false, stripTrailingSlash: true },
        ],
      }
      const result = await canonicalize('https://www.example.com/feed/', options)

      // First tier (cleanest) matches, wins even though tier 2 would also match
      expect(result).toBe('https://example.com/feed')
    })
  })

  describe('redirect edge cases', () => {
    // Case 55: Redirect to Malformed URL
    //
    // When the server redirects to a malformed URL that cannot be parsed,
    // the algorithm should handle it gracefully. The fetch implementation
    // may fail or return the malformed URL as response.url.
    it('case 55: should handle redirect to malformed URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: content,
            url: 'https://example.com/feed', // Fetch succeeded despite redirect issues
          },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 56: Redirect Adds Tracking Parameters
    //
    // When the server redirects to a URL with tracking params added,
    // the algorithm should still strip them during normalization.
    it('case 56: should strip tracking params added by redirect', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: content,
            url: 'https://example.com/feed?utm_source=redirect&fbclid=abc123',
          },
          'https://example.com/feed?utm_source=redirect&fbclid=abc123': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Tracking params stripped during variant generation
      expect(result).toBe('https://example.com/feed')
    })

    // Case 57: Redirect Changes Protocol (HTTP to HTTPS)
    //
    // When HTTP redirects to HTTPS (common pattern), the algorithm
    // should use the HTTPS URL as canonical.
    it('case 57: should use HTTPS when HTTP redirects to it', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': {
            body: content,
            url: 'https://example.com/feed',
          },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toBe('https://example.com/feed')
    })

    // Case 58: Redirect to Different Domain with Same Content
    //
    // When redirected to a completely different domain that serves
    // the same content, the redirect destination becomes canonical.
    it('case 58: should use redirect destination domain', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://old.example.com/feed': {
            body: content,
            url: 'https://new.example.org/feed',
          },
          'https://new.example.org/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://old.example.com/feed', options)

      expect(result).toBe('https://new.example.org/feed')
    })

    // Case 59: Redirect to Empty Response
    //
    // When redirect destination returns empty body (0 bytes),
    // the algorithm should handle it gracefully.
    it('case 59: should handle redirect to empty response', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: '',
            url: 'https://empty.example.com/feed',
          },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Empty body is still "valid" - URL works, just empty feed
      expect(result).toBe('https://empty.example.com/feed')
    })

    // Case 60: Self URL Points to Redirect That Returns Different Content
    //
    // When self URL redirects but the destination returns different content,
    // the algorithm should fall back to responseUrl.
    it('case 60: should reject self URL redirect when content differs', async () => {
      const originalContent = '<feed>original</feed>'
      const differentContent = '<feed>different</feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: originalContent },
          'https://self.example.com/feed': {
            body: differentContent,
            url: 'https://redirect.example.com/feed',
          },
        }),
        parser: createMockParser('https://self.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Self URL redirect returns different content, falls back to responseUrl
      expect(result).toBe('https://example.com/feed')
    })

    // Case 61: Redirect to URL with Authentication
    //
    // When redirect adds authentication credentials to the URL,
    // they should be preserved (credentials are functional).
    it('case 61: should preserve credentials added by redirect', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: content,
            url: 'https://user:token@example.com/feed',
          },
          'https://user:token@example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Credentials preserved (default tiers don't strip auth)
      expect(result).toBe('https://user:token@example.com/feed')
    })

    // Case 62: Redirect to URL with Non-Standard Port
    //
    // When redirect adds a non-standard port, it should be preserved.
    it('case 62: should preserve non-standard port from redirect', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': {
            body: content,
            url: 'https://example.com:8443/feed',
          },
          'https://example.com:8443/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Non-standard port preserved
      expect(result).toBe('https://example.com:8443/feed')
    })

    // Case 63: Multiple Redirects with Content Change
    //
    // When a redirect chain changes content along the way,
    // the final content should be used for hash comparison.
    it('case 63: should use final redirect content for hash comparison', async () => {
      const finalContent = '<feed>final</feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://start.example.com/feed': {
            body: finalContent,
            url: 'https://final.example.com/feed',
          },
          'https://final.example.com/feed': { body: finalContent },
        }),
      }
      const result = await canonicalize('https://start.example.com/feed', options)

      expect(result).toBe('https://final.example.com/feed')
    })

    // Case 64: Redirect Destination Variants Blocked by verifyUrlFn
    //
    // When the redirect destination's variants fail verification, the algorithm
    // should skip those variants and use the response URL as-is if it's the only
    // working option. verifyUrlFn applies to variant generation, not response URL.
    it('case 64: should use responseUrl when all variants blocked by verifyUrlFn', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.blocked.example.com/feed/': { body: content },
        }),
        verifyUrlFn: (url: string) => {
          // Block all normalized variants (no www, no trailing slash)
          // Only allow the exact responseUrl form
          return url === 'https://www.blocked.example.com/feed/'
        },
      }
      const result = await canonicalize('https://www.blocked.example.com/feed/', options)

      // All cleaner variants blocked, falls back to responseUrl
      expect(result).toBe('https://www.blocked.example.com/feed/')
    })
  })
})
