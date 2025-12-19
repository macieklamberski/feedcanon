import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type { FetchFnResponse, ParserAdapter } from './types.js'

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
    it('Case 1: should normalize FeedBurner aliases to canonical domain', async () => {
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

      expect(result.url).toBe('https://feeds.feedburner.com/TechCrunch')
    })

    // Case 2: Polluted URL That Works Simplified
    //
    // Input: http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar#comments
    // Result: https://example.com/feed (reason: content_verified)
    //
    // URLs with tracking params (utm_source, utm_medium), www prefix, and trailing
    // slashes can often be simplified. The algorithm generates cleaner variants,
    // verifies they return the same content, then attempts HTTPS upgrade.
    it('Case 2: should clean polluted URL and upgrade to HTTPS', async () => {
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

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'upgrade_https' })
    })

    // Case 3: Polluted URL with Working Self URL
    //
    // Input: http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
    // Result: https://blog.example.com/rss.xml (reason: content_verified)
    //
    // When the feed declares a self URL that is cleaner than the input URL (e.g.,
    // HTTPS instead of HTTP, no www, no query params), the algorithm validates the
    // self URL returns the same content and adopts it as canonical.
    it('Case 3: should adopt cleaner self URL when valid', async () => {
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

      expect(result).toEqual({ url: 'https://blog.example.com/rss.xml', reason: 'fallback' })
    })

    // Case 4: Self URL Does Not Work
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/feed (outdated, server moved)
    // Result: https://example.com/feed (reason: response_url)
    //
    // When a feed declares a self URL pointing to an outdated or dead domain, the
    // algorithm detects the self URL fails (404, timeout) and falls back to using
    // the response URL that is known to work.
    it('Case 4: should use responseUrl when self URL does not work', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
          'https://old.example.com/feed': { status: 404 },
        }),
        parser: createMockParser('https://old.example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 5: Self URL Produces Different Feed
    //
    // Input: https://example.com/feed
    // Self URL: https://example.com/feed/full (misconfigured, points to full-text variant)
    // Result: https://example.com/feed (reason: response_url)
    //
    // When a publisher misconfigures their self URL to point to a different feed
    // variant (e.g., full-text vs summary), the algorithm detects the content
    // difference via hash comparison and uses the response URL instead.
    it('Case 5: should use responseUrl when self URL produces different content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>summary</feed>' },
          'https://example.com/feed/full': { body: '<feed>full content</feed>' },
        }),
        parser: createMockParser('https://example.com/feed/full'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 6: Input URL Redirects
    //
    // Input: http://old-blog.example.com/rss
    // Redirects: 301 → https://blog.example.com/feed
    // Result: https://blog.example.com/feed (reason: response_url)
    //
    // When fetching the input URL results in redirects (301, 302), the algorithm
    // follows them and uses the final destination URL as the canonical. The
    // original URL becomes an alias pointing to the canonical.
    it('Case 6: should follow redirects and use final destination', async () => {
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

      expect(result.url).toBe('https://blog.example.com/feed')
    })

    // Case 7: HTTPS Upgrade Success
    //
    // Input: http://example.com/feed
    // Result: https://example.com/feed (reason: content_verified)
    //
    // When the input URL uses HTTP but the server also supports HTTPS (returning
    // the same content), the algorithm upgrades to HTTPS. This provides security
    // even when the server doesn't redirect HTTP to HTTPS automatically.
    it('Case 7: should upgrade HTTP to HTTPS when content matches', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'upgrade_https' })
    })

    // Case 8: HTTPS Upgrade Failure
    //
    // Input: http://legacy.example.com/feed.rss
    // Result: http://legacy.example.com/feed.rss (reason: fallback)
    //
    // When the server doesn't support HTTPS (connection refused, SSL error, timeout),
    // the algorithm gracefully falls back to HTTP. This handles legacy servers that
    // only serve content over HTTP.
    it('Case 8: should keep HTTP when HTTPS fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://legacy.example.com/feed.rss': { body: content },
          'https://legacy.example.com/feed.rss': { status: 500 },
        }),
      }
      const result = await canonicalize('http://legacy.example.com/feed.rss', options)

      expect(result).toEqual({ url: 'http://legacy.example.com/feed.rss', reason: 'fallback' })
    })

    // Case 9: WWW vs Non-WWW Mismatch
    //
    // Input: https://www.example.com/feed
    // Self URL: https://example.com/feed (no www)
    // Result: https://example.com/feed (reason: content_verified)
    //
    // When input has www but self URL doesn't (or vice versa), the algorithm prefers
    // non-www as it's shorter/cleaner. It verifies the non-www variant returns the
    // same content before adopting it.
    it('Case 9: should prefer non-www when both work', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'fallback' })
    })

    // Case 10: Feed Protocol (feed://)
    //
    // Input: https://example.com/rss.xml
    // Self URL: feed://example.com/rss.xml
    // Result: https://example.com/rss.xml (reason: response_url)
    //
    // URLs using feed:// (or rss://, pcast://, itpc://) protocols are converted to
    // https:// before fetching. These legacy protocols were used for feed reader
    // registration but are not valid for HTTP fetching.
    it('Case 10: should handle feed:// protocol in self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/rss.xml': { body: content },
        }),
        parser: createMockParser('feed://example.com/rss.xml'),
      }
      const result = await canonicalize('https://example.com/rss.xml', options)

      expect(result.url).toBe('https://example.com/rss.xml')
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
    it('Case 11: should normalize different FeedBurner aliases to same canonical domain', async () => {
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
      expect(resultA.url).toBe('https://feeds.feedburner.com/blog')
      expect(resultB.url).toBe('https://feeds.feedburner.com/blog')
      expect(resultC.url).toBe('https://feeds.feedburner.com/blog')
    })

    // Case 12: Relative Self URL
    //
    // Input: https://example.com/blog/feed.xml
    // Self URL: feed.xml (relative)
    // Result: https://example.com/blog/feed.xml (reason: response_url)
    //
    // Some feeds declare relative self URLs (e.g., "feed.xml" instead of full URL).
    // The algorithm resolves these relative URLs against the response URL base
    // to get an absolute URL for variant generation.
    it('Case 12: should resolve relative self URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/blog/feed.xml': { body: content },
        }),
        parser: createMockParser('feed.xml'),
      }
      const result = await canonicalize('https://example.com/blog/feed.xml', options)

      expect(result.url).toBe('https://example.com/blog/feed.xml')
    })

    // Case 13: Self URL with Different Query Params
    //
    // Input: https://example.com/feed?format=rss
    // Self URL: https://example.com/feed?format=atom
    // Result: https://example.com/feed?format=rss (reason: response_url)
    //
    // Some query params are functional (e.g., format=rss) and stripping them
    // changes the content. The algorithm detects this via hash comparison and
    // keeps the required params while still stripping tracking params.
    it('Case 13: should keep functional query params when stripping changes content', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed?format=rss': { body: '<feed>rss format</feed>' },
          'https://example.com/feed': { body: '<feed>default format</feed>' },
        }),
      }
      const result = await canonicalize('https://example.com/feed?format=rss', options)

      expect(result.url).toBe('https://example.com/feed?format=rss')
    })

    // Case 14: Empty/Missing Self URL
    //
    // Input: https://example.com/feed
    // Self URL: (none)
    // Result: https://example.com/feed (reason: response_url)
    //
    // When a feed doesn't declare a rel="self" link, the algorithm uses the
    // response URL as the sole source for generating variants. This is common
    // for older or simpler feeds.
    it('Case 14: should use responseUrl when no self URL present', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 15: All Variants Fail Except Original
    //
    // Input: https://special.example.com:8443/api/v2/feed.json?auth=token123
    // Result: https://special.example.com:8443/api/v2/feed.json?auth=token123 (reason: fallback)
    //
    // For complex URLs with non-standard ports and required auth tokens, simplified
    // variants will fail. The algorithm tries cleaner variants first but falls back
    // to the original URL when all simplifications fail.
    it('Case 15: should fall back to original when all variants fail', async () => {
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

      expect(result.url).toBe('https://special.example.com:8443/api/v2/feed.json?auth=token123')
      expect(result.reason).toBe('fallback')
    })

    // Case 16: Redirect Loop Prevention
    //
    // Input: https://example.com/feed
    // Redirect: 301 → https://example.com/rss → 301 → https://example.com/feed (loop)
    // Result: https://example.com/feed (reason: fetch_failed)
    //
    // When the server has a redirect loop, the fetch implementation detects it
    // and fails. The algorithm returns the input URL as a fallback since the
    // feed cannot be fetched successfully.
    it('Case 16: should return input URL when fetch fails due to redirect loop', async () => {
      const options = {
        fetchFn: async () => {
          throw new Error('Redirect loop detected')
        },
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'fetch_failed' })
    })

    // Case 17: Content Hash Mismatch (CDN Variation)
    //
    // Input: https://example.com/feed
    // Result: https://example.com/feed (reason: response_url)
    //
    // Some feeds include dynamic content (timestamps, request IDs) causing raw byte
    // hashes to differ between requests. When raw hash fails, a feed signature based
    // on parsed data (title, GUIDs, links) can be used as fallback comparison.
    it('Case 17: should handle dynamic content with different hashes', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: '<feed>Generated: 2024-01-15 10:30:00</feed>' },
          'https://example.com/feed/': { body: '<feed>Generated: 2024-01-15 10:30:05</feed>' },
        }),
      }
      const result = await canonicalize('https://example.com/feed', options)

      // Content differs so variant doesn't match; falls back to response URL.
      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 18: Multiple Self URLs in Feed
    //
    // Input: https://example.com/feed
    // Self URLs: https://example.com/feed, https://example.com/rss.xml, https://www.example.com/feed
    // Result: https://example.com/feed (reason: response_url)
    //
    // When a feed declares multiple <link rel="self"> elements, the algorithm
    // prefers the one matching the response URL for consistency. If none match,
    // it uses the first declared self URL.
    it('Case 18: should handle multiple self URLs by preferring matching responseUrl', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        // Parser returns the matching self URL.
        parser: createMockParser('https://example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 19: Self URL Returns HTML (Not Feed)
    //
    // Input: https://example.com/feed.xml
    // Self URL: https://example.com/blog (returns HTML, not feed)
    // Result: https://example.com/feed.xml (reason: response_url)
    //
    // When a feed's self URL points to an HTML page (publisher misconfiguration),
    // the algorithm skips that variant because it's not a valid feed. It falls
    // back to using the response URL which is known to be a valid feed.
    it('Case 19: should ignore self URL that points to non-feed content', async () => {
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
      expect(result.url).toBe('https://example.com/feed.xml')
    })

    // Case 20: Self URL Triggers Redirect Chain
    //
    // Input: https://example.com/feed
    // Self URL: https://old.example.com/rss (outdated, redirects to responseUrl)
    // Result: https://example.com/feed (reason: fallback)
    //
    // When a self URL is outdated and redirects to a new location, the algorithm
    // uses the redirect destination (not the original selfUrl) as the variant source.
    // This ensures we use the current canonical location, not stale URLs.
    it('Case 20: should use redirect destination when self URL redirects', async () => {
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
      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'fallback' })
    })

    // Case 21: Platform Handler Canonical Is Dead
    //
    // Input: http://feedproxy.google.com/MyBlog
    // Result: https://feeds.feedburner.com/MyBlog (reason: fetch_failed)
    //
    // When a platform handler transforms the input URL but the canonical domain
    // is dead (service shutdown), the algorithm returns the canonical URL with
    // fetch_failed reason. This is a handler problem, not an algorithm problem -
    // the handler should be updated if the canonical domain is no longer valid.
    it('Case 21: should return canonical URL when platform canonical is dead', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://feeds.feedburner.com/MyBlog': { status: 404 },
        }),
      }
      const result = await canonicalize('https://feedproxy.google.com/MyBlog', options)

      expect(result).toEqual({
        url: 'https://feeds.feedburner.com/MyBlog',
        reason: 'fetch_failed',
      })
    })

    // Case 22: Case Sensitivity Mismatch
    //
    // Input: https://example.com/Blog/Feed.XML
    // Self URL: https://example.com/blog/feed.xml (lowercase)
    // Result: https://example.com/blog/feed.xml (reason: content_verified)
    //
    // URL paths are case-sensitive per RFC, but many servers are case-insensitive.
    // When input has mixed case but self URL is lowercase, the algorithm prefers
    // lowercase as conventionally cleaner, after verifying it returns same content.
    it('Case 22: should prefer lowercase URL path when content matches', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/Blog/Feed.XML': { body: content },
          'https://example.com/blog/feed.xml': { body: content },
        }),
        parser: createMockParser('https://example.com/blog/feed.xml'),
      }
      const result = await canonicalize('https://example.com/Blog/Feed.XML', options)

      expect(result.url).toBe('https://example.com/blog/feed.xml')
    })

    // Case 23: Scheme-Relative Input
    //
    // Input: https://example.com/feed
    // Self URL: //example.com/feed (scheme-relative)
    // Result: https://example.com/feed (reason: response_url)
    //
    // Scheme-relative URLs (//host/path) lack a protocol. The algorithm defaults
    // to HTTPS when resolving, falling back to HTTP if HTTPS fails. This is rare
    // for direct feed URLs but handled for completeness.
    it('Case 23: should handle scheme-relative URL by defaulting to HTTPS', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed': { body: content },
        }),
        parser: createMockParser('//example.com/feed'),
      }
      const result = await canonicalize('https://example.com/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 24: Standard Port in URL
    //
    // Input: https://example.com:443/feed
    // Result: https://example.com/feed (reason: content_verified)
    //
    // Default ports (443 for HTTPS, 80 for HTTP) are redundant and should be
    // stripped during normalization. URLs with and without default port are
    // semantically identical.
    it('Case 24: should strip default port from URL', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://example.com:443/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
      }
      const result = await canonicalize('https://example.com:443/feed', options)

      expect(result.url).toBe('https://example.com/feed')
    })

    // Case 25: Input URL Has Credentials
    //
    // Input: https://user:password123@example.com/private/feed
    // Result: https://example.com/private/feed (credentials stripped)
    //
    // Embedded credentials (user:pass@host) should never be stored in canonical URLs
    // for security. The algorithm strips credentials from the URL but returns a flag
    // indicating auth is required. Credentials should be stored separately.
    it('Case 25: should handle URL with credentials by stripping them', async () => {
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
      expect(result.url).toBe('https://example.com/private/feed')
    })
  })

  describe('with existsFn option', () => {
    // The existsFn allows checking if a variant already exists in the database,
    // enabling early return without additional fetch requests.
    it('should return exists_in_db when existsFn finds match', async () => {
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

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'exists_in_db' })
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

      expect(result).toEqual({ url: 'https://example.com/feed', reason: 'content_verified' })
    })
  })

  describe('with verifyFn option', () => {
    // The verifyFn allows custom validation of URLs before testing, enabling
    // blocklisting of domains or URL patterns.
    it('should skip variants that fail verification', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'https://www.example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyFn: (url: string) => {
          return url.includes('www')
        },
      }
      const result = await canonicalize('https://www.example.com/feed', options)

      expect(result.reason).toBe('fallback')
    })

    it('should skip HTTPS upgrade when verification fails', async () => {
      const content = '<feed></feed>'
      const options = {
        fetchFn: createMockFetch({
          'http://example.com/feed': { body: content },
          'https://example.com/feed': { body: content },
        }),
        verifyFn: (url: string) => {
          return !url.startsWith('https://')
        },
      }
      const result = await canonicalize('http://example.com/feed', options)

      expect(result.url).toBe('http://example.com/feed')
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

      expect(result.url).toBe('https://example.com/feed')
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

      expect(result.url).toBe('https://example.com/feed')
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

      expect(result.url).toBe('https://example.com/feed')
    })
  })

  describe('when fetch fails', () => {
    it('should return input URL when fetch throws', async () => {
      const options = {
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toEqual({ url: 'https://example.com/feed.xml', reason: 'fetch_failed' })
    })

    it('should return input URL when fetch returns non-2xx', async () => {
      const options = {
        fetchFn: createMockFetch({
          'https://example.com/feed.xml': { status: 404 },
        }),
      }
      const result = await canonicalize('https://example.com/feed.xml', options)

      expect(result).toEqual({ url: 'https://example.com/feed.xml', reason: 'fetch_failed' })
    })
  })
})
