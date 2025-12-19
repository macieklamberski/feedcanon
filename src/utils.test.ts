import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import type { FetchFnResponse, NormalizeOptions } from './types.js'
import {
  addMissingProtocol,
  defaultFetchFn,
  isSimilarUrl,
  normalizeUrl,
  resolveNonStandardFeedUrl,
  resolveUrl,
} from './utils.js'

describe('resolveNonStandardFeedUrl', () => {
  it('should convert feed:// to https://', () => {
    const value = 'feed://example.com/rss.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should convert rss:// to https://', () => {
    const value = 'rss://example.com/feed.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should convert pcast:// to https://', () => {
    const value = 'pcast://example.com/podcast.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/podcast.xml'

    expect(result).toBe(expected)
  })

  it('should convert itpc:// to https://', () => {
    const value = 'itpc://example.com/podcast.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/podcast.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap feed:https:// to https://', () => {
    const value = 'feed:https://example.com/rss.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap feed:http:// to http://', () => {
    const value = 'feed:http://example.com/rss.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'http://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap rss:https:// to https://', () => {
    const value = 'rss:https://example.com/feed.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should return https URLs unchanged', () => {
    const value = 'https://example.com/feed.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should return http URLs unchanged', () => {
    const value = 'http://example.com/rss.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'http://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should return absolute path URLs unchanged', () => {
    const value = '/path/to/feed'
    const result = resolveNonStandardFeedUrl(value)
    const expected = '/path/to/feed'

    expect(result).toBe(expected)
  })

  it('should return relative path URLs unchanged', () => {
    const value = 'relative/feed.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'relative/feed.xml'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with paths and query params', () => {
    const value = 'feed://example.com/path/to/feed?format=rss'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/path/to/feed?format=rss'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with ports', () => {
    const value = 'feed://example.com:8080/feed.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com:8080/feed.xml'

    expect(result).toBe(expected)
  })

  it('should handle uppercase feed protocols', () => {
    expect(resolveNonStandardFeedUrl('FEED://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
    expect(resolveNonStandardFeedUrl('Feed://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
    expect(resolveNonStandardFeedUrl('FEED:https://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
    expect(resolveNonStandardFeedUrl('RSS://example.com/feed.xml')).toBe(
      'https://example.com/feed.xml',
    )
    expect(resolveNonStandardFeedUrl('PCAST://example.com/podcast.xml')).toBe(
      'https://example.com/podcast.xml',
    )
  })

  it('should handle mixed case in wrapped URL protocol', () => {
    expect(resolveNonStandardFeedUrl('feed:HTTPS://example.com/rss.xml')).toBe(
      'HTTPS://example.com/rss.xml',
    )
    expect(resolveNonStandardFeedUrl('feed:Http://example.com/rss.xml')).toBe(
      'Http://example.com/rss.xml',
    )
  })

  it('should return empty string unchanged', () => {
    expect(resolveNonStandardFeedUrl('')).toBe('')
  })

  it('should return malformed feed URL unchanged (no slashes)', () => {
    // feed:example.com is malformed - neither feed://example.com nor feed:https://example.com
    expect(resolveNonStandardFeedUrl('feed:example.com')).toBe('feed:example.com')
  })

  it('should handle feed URLs with authentication', () => {
    const value = 'feed://user:pass@example.com/rss.xml'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://user:pass@example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with hash fragment', () => {
    const value = 'feed://example.com/rss.xml#latest'
    const result = resolveNonStandardFeedUrl(value)
    const expected = 'https://example.com/rss.xml#latest'

    expect(result).toBe(expected)
  })

  it('should respect custom protocols parameter', () => {
    const customProtocols = ['custom:']
    expect(resolveNonStandardFeedUrl('custom://example.com/feed', customProtocols)).toBe(
      'https://example.com/feed',
    )
    expect(resolveNonStandardFeedUrl('feed://example.com/feed', customProtocols)).toBe(
      'feed://example.com/feed',
    )
  })
})

describe('addMissingProtocol', () => {
  describe('Protocol-relative URLs', () => {
    const validCases = [
      { value: '//example.com/feed', expected: 'https://example.com/feed' },
      { value: '//cdn.example.com/style.css', expected: 'https://cdn.example.com/style.css' },
      { value: '//localhost/api', expected: 'https://localhost/api' },
      { value: '//192.168.1.1/api', expected: 'https://192.168.1.1/api' },
      { value: '//example.com:8080/feed', expected: 'https://example.com:8080/feed' },
      { value: '//[::1]/feed', expected: 'https://[::1]/feed' },
      { value: '//[2001:db8::1]/feed', expected: 'https://[2001:db8::1]/feed' },
    ]

    for (const { value, expected } of validCases) {
      it(`should convert ${value} to ${expected}`, () => {
        const result = addMissingProtocol(value)

        expect(result).toBe(expected)
      })
    }

    it('should use http when specified', () => {
      const value = '//example.com/feed'
      const result = addMissingProtocol(value, 'http')
      const expected = 'http://example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Bare domains', () => {
    it('should add https:// to domain without protocol', () => {
      const value = 'example.com/feed'
      const result = addMissingProtocol(value)
      const expected = 'https://example.com/feed'

      expect(result).toBe(expected)
    })

    it('should add https:// to domain with subdomain', () => {
      const value = 'www.example.com/feed.xml'
      const result = addMissingProtocol(value)
      const expected = 'https://www.example.com/feed.xml'

      expect(result).toBe(expected)
    })

    it('should use http when specified', () => {
      const value = 'example.com/feed'
      const result = addMissingProtocol(value, 'http')
      const expected = 'http://example.com/feed'

      expect(result).toBe(expected)
    })

    it('should handle domain with query string', () => {
      const value = 'example.com/feed?format=rss'
      const result = addMissingProtocol(value)
      const expected = 'https://example.com/feed?format=rss'

      expect(result).toBe(expected)
    })
  })

  describe('URLs that should not be modified', () => {
    it('should not modify http:// URLs', () => {
      const value = 'http://example.com/feed'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })

    it('should not modify https:// URLs', () => {
      const value = 'https://example.com/feed'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })

    it('should not modify absolute path URLs', () => {
      const value = '/path/to/feed'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })

    it('should not modify relative path URLs starting with dot', () => {
      const value = './feed.xml'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })

    it('should not modify relative path URLs starting with double dot', () => {
      const value = '../feed.xml'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })

    it('should handle localhost', () => {
      expect(addMissingProtocol('localhost')).toBe('https://localhost')
      expect(addMissingProtocol('localhost/')).toBe('https://localhost/')
      expect(addMissingProtocol('localhost:3000')).toBe('https://localhost:3000')
    })
  })

  describe('Invalid protocol-relative URLs', () => {
    const invalidCases = [
      '//Users/file.xml',
      '//home/user/file.txt',
      '///triple-slash',
      '//singlelabel',
    ]

    for (const value of invalidCases) {
      it(`should return ${value} unchanged`, () => {
        const result = addMissingProtocol(value)

        expect(result).toBe(value)
      })
    }

    it('should handle malformed URLs gracefully', () => {
      const value = '//not valid url $#@'
      const result = addMissingProtocol(value)

      expect(result).toBe(value)
    })
  })

  describe('Additional edge cases', () => {
    it('should handle bare domain with hash', () => {
      const value = 'example.com/feed#section'
      const result = addMissingProtocol(value)
      const expected = 'https://example.com/feed#section'

      expect(result).toBe(expected)
    })

    it('should not modify feed:// URLs (has valid protocol)', () => {
      expect(addMissingProtocol('feed://example.com/rss')).toBe('feed://example.com/rss')
      expect(addMissingProtocol('rss://example.com/feed')).toBe('rss://example.com/feed')
    })

    it('should handle domain with many subdomains', () => {
      const value = 'a.b.c.d.example.com/feed'
      const result = addMissingProtocol(value)
      const expected = 'https://a.b.c.d.example.com/feed'

      expect(result).toBe(expected)
    })

    it('should handle IDN bare domain', () => {
      const value = 'münchen.de/feed'
      const result = addMissingProtocol(value)
      const expected = 'https://münchen.de/feed'

      expect(result).toBe(expected)
    })

    it('should handle protocol-relative with query', () => {
      const value = '//example.com/feed?format=rss&page=1'
      const result = addMissingProtocol(value)
      const expected = 'https://example.com/feed?format=rss&page=1'

      expect(result).toBe(expected)
    })

    it('should handle bare domain without path', () => {
      const value = 'example.com'
      const result = addMissingProtocol(value)
      const expected = 'https://example.com'

      expect(result).toBe(expected)
    })

    it('should not modify mailto: URLs', () => {
      expect(addMissingProtocol('mailto:test@example.com')).toBe('mailto:test@example.com')
    })

    it('should not modify data: URLs', () => {
      expect(addMissingProtocol('data:text/html,<h1>Test</h1>')).toBe(
        'data:text/html,<h1>Test</h1>',
      )
    })
  })
})

describe('resolveUrl', () => {
  describe('Standard HTTP/HTTPS URLs', () => {
    it('should return https URL unchanged', () => {
      const value = 'https://example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should return http URL unchanged', () => {
      const value = 'http://example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('http://example.com/feed.xml')
    })

    it('should preserve query parameters', () => {
      const value = 'https://example.com/feed?format=rss&page=1'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed?format=rss&page=1')
    })

    it('should preserve hash fragments', () => {
      const value = 'https://example.com/feed#latest'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed#latest')
    })

    it('should preserve authentication credentials', () => {
      const value = 'https://user:pass@example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://user:pass@example.com/feed.xml')
    })

    it('should preserve non-standard ports', () => {
      const value = 'https://example.com:8443/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com:8443/feed.xml')
    })

    it('should strip default HTTPS port', () => {
      const value = 'https://example.com:443/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should strip default HTTP port', () => {
      const value = 'http://example.com:80/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('http://example.com/feed.xml')
    })
  })

  describe('Feed protocol resolution', () => {
    it('should convert feed:// to https://', () => {
      const value = 'feed://example.com/rss.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/rss.xml')
    })

    it('should unwrap feed:https:// to https://', () => {
      const value = 'feed:https://example.com/rss.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/rss.xml')
    })

    it('should unwrap feed:http:// to http://', () => {
      const value = 'feed:http://example.com/rss.xml'
      const result = resolveUrl(value)

      expect(result).toBe('http://example.com/rss.xml')
    })

    it('should convert rss:// to https://', () => {
      const value = 'rss://example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should unwrap rss:https:// to https://', () => {
      const value = 'rss:https://example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should convert pcast:// to https://', () => {
      const value = 'pcast://example.com/podcast.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/podcast.xml')
    })

    it('should convert itpc:// to https://', () => {
      const value = 'itpc://example.com/podcast.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/podcast.xml')
    })

    it('should preserve path and query in feed URLs', () => {
      const value = 'feed://example.com/path/to/feed.xml?format=rss'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/path/to/feed.xml?format=rss')
    })

    it('should preserve port in feed URLs', () => {
      const value = 'feed://example.com:8080/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com:8080/feed.xml')
    })

    it('should handle uppercase feed protocols', () => {
      expect(resolveUrl('FEED://example.com/rss.xml')).toBe('https://example.com/rss.xml')
      expect(resolveUrl('Feed://example.com/rss.xml')).toBe('https://example.com/rss.xml')
      expect(resolveUrl('FEED:https://example.com/rss.xml')).toBe('https://example.com/rss.xml')
    })
  })

  describe('Protocol-relative URLs', () => {
    it('should convert // to https:// by default', () => {
      const value = '//example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should handle subdomain', () => {
      const value = '//cdn.example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://cdn.example.com/feed.xml')
    })

    it('should handle localhost', () => {
      const value = '//localhost/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://localhost/feed.xml')
    })

    it('should handle IPv4 address', () => {
      const value = '//192.168.1.1/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://192.168.1.1/feed.xml')
    })

    it('should handle IPv6 address', () => {
      expect(resolveUrl('//[::1]/feed.xml')).toBe('https://[::1]/feed.xml')
      expect(resolveUrl('//[2001:db8::1]/feed.xml')).toBe('https://[2001:db8::1]/feed.xml')
    })

    it('should handle port', () => {
      const value = '//example.com:8080/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com:8080/feed.xml')
    })

    it('should inherit http from base URL', () => {
      const value = '//example.com/feed.xml'
      const result = resolveUrl(value, 'http://other.com')

      expect(result).toBe('http://example.com/feed.xml')
    })

    it('should inherit https from base URL', () => {
      const value = '//example.com/feed.xml'
      const result = resolveUrl(value, 'https://other.com')

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should return undefined for file paths like //Users/', () => {
      const value = '//Users/file.xml'
      const result = resolveUrl(value)

      expect(result).toBeUndefined()
    })

    it('should return undefined for single-label hostnames', () => {
      const value = '//intranet/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBeUndefined()
    })
  })

  describe('Bare domains (no protocol)', () => {
    it('should add https:// to domain with path', () => {
      const value = 'example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should add https:// to domain without path', () => {
      const value = 'example.com'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/')
    })

    it('should handle subdomain', () => {
      const value = 'www.example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://www.example.com/feed.xml')
    })

    it('should handle deep subdomain', () => {
      const value = 'feeds.blog.example.com/rss'
      const result = resolveUrl(value)

      expect(result).toBe('https://feeds.blog.example.com/rss')
    })

    it('should handle port', () => {
      const value = 'example.com:8080/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com:8080/feed.xml')
    })

    it('should handle query string', () => {
      const value = 'example.com/feed?format=rss'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed?format=rss')
    })

    it('should handle localhost', () => {
      expect(resolveUrl('localhost')).toBe('https://localhost/')
      expect(resolveUrl('localhost/')).toBe('https://localhost/')
      expect(resolveUrl('localhost/feed.xml')).toBe('https://localhost/feed.xml')
      expect(resolveUrl('localhost:3000')).toBe('https://localhost:3000/')
      expect(resolveUrl('localhost:3000/feed.xml')).toBe('https://localhost:3000/feed.xml')
    })
  })

  describe('Relative URL resolution with base', () => {
    const baseUrl = 'https://example.com/blog/posts/'

    it('should resolve simple filename', () => {
      const value = 'feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/blog/posts/feed.xml')
    })

    it('should resolve current directory reference', () => {
      const value = './feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/blog/posts/feed.xml')
    })

    it('should resolve single parent directory', () => {
      const value = '../feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/blog/feed.xml')
    })

    it('should resolve multiple parent directories', () => {
      const value = '../../feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should resolve root-relative path', () => {
      const value = '/feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should resolve query-only reference', () => {
      const value = '?format=atom'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://example.com/blog/posts/?format=atom')
    })

    it('should not modify absolute URL when base is provided', () => {
      const value = 'https://other.com/feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://other.com/feed.xml')
    })

    it('should not modify feed:// URL when base is provided', () => {
      const value = 'feed://other.com/feed.xml'
      const result = resolveUrl(value, baseUrl)

      expect(result).toBe('https://other.com/feed.xml')
    })

    it('should inherit http from base when resolving relative URL', () => {
      const value = 'feed.xml'
      const result = resolveUrl(value, 'http://example.com/blog/')

      expect(result).toBe('http://example.com/blog/feed.xml')
    })
  })

  describe('URL normalization', () => {
    it('should normalize path segments (/../)', () => {
      const value = 'https://example.com/a/b/../feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/a/feed.xml')
    })

    it('should normalize path segments (/./)', () => {
      const value = 'https://example.com/./feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should lowercase hostname', () => {
      const value = 'https://EXAMPLE.COM/Feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/Feed.xml')
    })

    it('should preserve path case', () => {
      const value = 'https://example.com/Blog/Feed.XML'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/Blog/Feed.XML')
    })

    it('should add trailing slash to root path', () => {
      const value = 'https://example.com'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/')
    })
  })

  describe('Real-world feed patterns', () => {
    it('should handle Feedburner URL', () => {
      const value = 'http://feeds.feedburner.com/example'
      const result = resolveUrl(value)

      expect(result).toBe('http://feeds.feedburner.com/example')
    })

    it('should handle WordPress feed URL', () => {
      const value = 'https://example.com/feed/'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed/')
    })

    it('should handle WordPress RSS query parameter', () => {
      const value = 'https://example.com/?feed=rss2'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/?feed=rss2')
    })

    it('should handle Blogger Atom feed', () => {
      const value = 'https://example.blogspot.com/feeds/posts/default'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.blogspot.com/feeds/posts/default')
    })

    it('should handle URL with encoded characters', () => {
      const value = 'https://example.com/feed%20name.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed%20name.xml')
    })

    it('should handle international domain names', () => {
      const value = 'https://münchen.example.com/feed.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://xn--mnchen-3ya.example.com/feed.xml')
    })

    it('should handle YouTube channel RSS', () => {
      const value = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxx'
      const result = resolveUrl(value)

      expect(result).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxx')
    })

    it('should handle Reddit RSS', () => {
      const value = 'https://www.reddit.com/r/javascript/.rss'
      const result = resolveUrl(value)

      expect(result).toBe('https://www.reddit.com/r/javascript/.rss')
    })

    it('should handle Medium RSS', () => {
      const value = 'https://medium.com/feed/@username'
      const result = resolveUrl(value)

      expect(result).toBe('https://medium.com/feed/@username')
    })

    it('should handle GitHub releases Atom', () => {
      const value = 'https://github.com/owner/repo/releases.atom'
      const result = resolveUrl(value)

      expect(result).toBe('https://github.com/owner/repo/releases.atom')
    })

    it('should handle Substack RSS', () => {
      const value = 'https://example.substack.com/feed'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.substack.com/feed')
    })

    it('should handle Apple Podcasts style URL', () => {
      const value = 'https://podcasts.apple.com/podcast/id123456789'
      const result = resolveUrl(value)

      expect(result).toBe('https://podcasts.apple.com/podcast/id123456789')
    })
  })

  describe('Additional edge cases', () => {
    it('should handle hash-only reference with base', () => {
      const value = '#section'
      const result = resolveUrl(value, 'https://example.com/page')

      expect(result).toBe('https://example.com/page#section')
    })

    it('should return undefined for invalid base URL', () => {
      const value = 'feed.xml'
      const result = resolveUrl(value, 'not a valid base')

      expect(result).toBeUndefined()
    })

    it('should handle double-encoded characters', () => {
      // %2520 is double-encoded space (%25 is %, so %2520 decodes to %20)
      const value = 'https://example.com/path%2520with%2520spaces'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/path%2520with%2520spaces')
    })

    it('should handle URLs with unicode in path', () => {
      const value = 'https://example.com/café/feed'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/caf%C3%A9/feed')
    })

    it('should handle URLs with special query characters', () => {
      const value = 'https://example.com/feed?q=hello%20world&tag=%23test'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed?q=hello%20world&tag=%23test')
    })

    it('should handle URLs with embedded newline (URL API strips it)', () => {
      // URL constructor strips newlines, tabs, and leading/trailing whitespace
      const value = 'https://example.com/feed\n.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com/feed.xml')
    })

    it('should handle bare domain with very long TLD', () => {
      const value = 'example.photography/feed'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.photography/feed')
    })

    it('should handle URL with empty path segments', () => {
      const value = 'https://example.com//feed//rss.xml'
      const result = resolveUrl(value)

      expect(result).toBe('https://example.com//feed//rss.xml')
    })
  })

  describe('Invalid and rejected inputs', () => {
    it('should return undefined for empty string', () => {
      expect(resolveUrl('')).toBeUndefined()
    })

    it('should return undefined for whitespace only', () => {
      expect(resolveUrl('   ')).toBeUndefined()
    })

    it('should return undefined for relative path without base', () => {
      expect(resolveUrl('path/to/feed')).toBeUndefined()
      expect(resolveUrl('path/to/feed.xml')).toBeUndefined()
    })

    it('should return undefined for ftp:// protocol', () => {
      expect(resolveUrl('ftp://example.com/feed.xml')).toBeUndefined()
    })

    it('should return undefined for mailto: protocol', () => {
      expect(resolveUrl('mailto:feed@example.com')).toBeUndefined()
    })

    it('should return undefined for tel: protocol', () => {
      expect(resolveUrl('tel:+1234567890')).toBeUndefined()
    })

    it('should return undefined for javascript: protocol', () => {
      expect(resolveUrl('javascript:alert(1)')).toBeUndefined()
    })

    it('should return undefined for data: protocol', () => {
      expect(resolveUrl('data:text/xml,<feed/>')).toBeUndefined()
    })

    it('should return undefined for file:// protocol', () => {
      expect(resolveUrl('file:///etc/passwd')).toBeUndefined()
    })

    it('should return undefined for malformed URL', () => {
      expect(resolveUrl('not a valid url')).toBeUndefined()
    })

    it('should return undefined for protocol only', () => {
      expect(resolveUrl('https://')).toBeUndefined()
    })
  })
})

describe('normalizeUrl', () => {
  describe('Protocol stripping', () => {
    it('should strip https:// protocol by default', () => {
      const value = 'https://example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should strip http:// protocol by default', () => {
      const value = 'http://example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve protocol when stripProtocol option is false', () => {
      const value = 'https://example.com/feed'
      const result = normalizeUrl(value, { stripProtocol: false })
      const expected = 'https://example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Authentication handling', () => {
    it('should preserve username and password by default', () => {
      const value = 'https://user:pass@example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'user:pass@example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve username only by default', () => {
      const value = 'https://user@example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'user@example.com/feed'

      expect(result).toBe(expected)
    })

    it('should strip authentication when stripAuthentication option is true', () => {
      const value = 'https://user:pass@example.com/feed'
      const result = normalizeUrl(value, { stripAuthentication: true, stripProtocol: false })
      const expected = 'https://example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('WWW stripping', () => {
    it('should strip www prefix by default', () => {
      const value = 'https://www.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve www when stripWww option is false', () => {
      const value = 'https://www.example.com/feed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripWww: false })
      const expected = 'www.example.com/feed'

      expect(result).toBe(expected)
    })

    it('should not affect non-www hostnames', () => {
      const value = 'https://cdn.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'cdn.example.com/feed'

      expect(result).toBe(expected)
    })

    it('should handle www in subdomain correctly', () => {
      const value = 'https://www.blog.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'blog.example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Port stripping', () => {
    it('should strip default HTTPS port 443', () => {
      const value = 'https://example.com:443/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should strip default HTTP port 80', () => {
      const value = 'http://example.com:80/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve non-default ports', () => {
      const value = 'https://example.com:8080/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com:8080/feed'

      expect(result).toBe(expected)
    })

    it('should not additionally strip port when stripDefaultPorts option is false', () => {
      const value = 'https://example.com:8080/feed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripDefaultPorts: false })
      const expected = 'example.com:8080/feed'

      expect(result).toBe(expected)
    })

    it('should not strip port 80 for HTTPS', () => {
      const value = 'https://example.com:80/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com:80/feed'

      expect(result).toBe(expected)
    })

    it('should not strip port 443 for HTTP', () => {
      const value = 'http://example.com:443/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com:443/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Trailing slash removal', () => {
    it('should remove trailing slash from path by default', () => {
      const value = 'https://example.com/feed/'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve trailing slash when stripTrailingSlash option is false', () => {
      const value = 'https://example.com/feed/'
      const result = normalizeUrl(value, {
        ...defaultNormalizeOptions,
        stripTrailingSlash: false,
        stripRootSlash: false,
      })
      const expected = 'example.com/feed/'

      expect(result).toBe(expected)
    })

    it('should handle multiple trailing slashes after collapse', () => {
      const value = 'https://example.com/feed///'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Single slash (root path) handling', () => {
    it('should keep root slash (URL API limitation)', () => {
      const value = 'https://example.com/'
      const result = normalizeUrl(value)
      const expected = 'example.com/'

      expect(result).toBe(expected)
    })

    it('should not affect paths with content', () => {
      const value = 'https://example.com/a'
      const result = normalizeUrl(value)
      const expected = 'example.com/a'

      expect(result).toBe(expected)
    })
  })

  describe('Multiple slashes collapsing', () => {
    it('should collapse multiple slashes in path by default', () => {
      const value = 'https://example.com/path//to///feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/path/to/feed'

      expect(result).toBe(expected)
    })

    it('should preserve multiple slashes when collapseSlashes option is false', () => {
      const value = 'https://example.com/path//to///feed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, collapseSlashes: false })
      const expected = 'example.com/path//to///feed'

      expect(result).toBe(expected)
    })
  })

  describe('Hash/fragment stripping', () => {
    it('should strip hash fragment by default', () => {
      const value = 'https://example.com/feed#section'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve hash when stripHash option is false', () => {
      const value = 'https://example.com/feed#section'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripHash: false })
      const expected = 'example.com/feed#section'

      expect(result).toBe(expected)
    })

    it('should handle empty hash', () => {
      const value = 'https://example.com/feed#'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Text fragment stripping', () => {
    it('should strip text fragments by default when stripHash is false', () => {
      const value = 'https://example.com/feed#:~:text=hello'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripHash: false })
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should preserve text fragments when stripTextFragment option is false', () => {
      const value = 'https://example.com/feed#:~:text=hello'
      const result = normalizeUrl(value, {
        ...defaultNormalizeOptions,
        stripHash: false,
        stripTextFragment: false,
      })
      const expected = 'example.com/feed#:~:text=hello'

      expect(result).toBe(expected)
    })
  })

  describe('Query parameter sorting', () => {
    it('should sort query parameters alphabetically by default', () => {
      const value = 'https://example.com/feed?z=3&a=1&m=2'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?a=1&m=2&z=3'

      expect(result).toBe(expected)
    })

    it('should preserve query order when sortQueryParams option is false', () => {
      const value = 'https://example.com/feed?z=3&a=1&m=2'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, sortQueryParams: false })
      const expected = 'example.com/feed?z=3&a=1&m=2'

      expect(result).toBe(expected)
    })
  })

  describe('Tracking parameter stripping', () => {
    it('should strip UTM parameters by default', () => {
      const value = 'https://example.com/feed?utm_source=twitter&utm_medium=social&id=123'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?id=123'

      expect(result).toBe(expected)
    })

    it('should strip fbclid by default', () => {
      const value = 'https://example.com/feed?fbclid=abc123&id=456'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?id=456'

      expect(result).toBe(expected)
    })

    it('should strip gclid by default', () => {
      const value = 'https://example.com/feed?gclid=xyz789&page=1'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?page=1'

      expect(result).toBe(expected)
    })

    it('should preserve tracking params when stripParams is empty array', () => {
      const value = 'https://example.com/feed?utm_source=twitter&id=123'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripParams: [] })
      const expected = 'example.com/feed?id=123&utm_source=twitter'

      expect(result).toBe(expected)
    })

    it('should use custom stripped params when array is provided', () => {
      const value = 'https://example.com/feed?custom=1&keep=2&utm_source=twitter'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripParams: ['custom'] })
      const expected = 'example.com/feed?keep=2&utm_source=twitter'

      expect(result).toBe(expected)
    })

    it('should handle URL with only tracking params', () => {
      const value = 'https://example.com/feed?utm_source=twitter&utm_medium=social'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Empty query removal', () => {
    it('should remove empty query string by default', () => {
      const value = 'https://example.com/feed?'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })

    it('should remove empty query (URL API normalizes it)', () => {
      const value = 'https://example.com/feed?'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripEmptyQuery: false })
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Percent encoding normalization', () => {
    it('should decode unnecessarily encoded safe chars by default', () => {
      // %2D is '-', which is safe in paths
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const result = normalizeUrl(value)
      const expected = 'example.com/path-to-feed'

      expect(result).toBe(expected)
    })

    it('should decode encoded alphanumeric chars', () => {
      // %41 is 'A', %61 is 'a'
      const value = 'https://example.com/%41%42%43/%61%62%63'
      const result = normalizeUrl(value)
      const expected = 'example.com/ABC/abc'

      expect(result).toBe(expected)
    })

    it('should normalize lowercase hex to uppercase', () => {
      // %2f should become %2F (forward slash must stay encoded)
      const value = 'https://example.com/path%2fencoded'
      const result = normalizeUrl(value)
      const expected = 'example.com/path%2Fencoded'

      expect(result).toBe(expected)
    })

    it('should keep space encoded but normalize hex case', () => {
      // %20 (space) should stay encoded
      const value = 'https://example.com/hello%20world'
      const result = normalizeUrl(value)
      const expected = 'example.com/hello%20world'

      expect(result).toBe(expected)
    })

    it('should decode multiple safe chars in sequence', () => {
      // Tilde, period, underscore are safe
      const value = 'https://example.com/%7E%2E%5F'
      const result = normalizeUrl(value)
      const expected = 'example.com/~._'

      expect(result).toBe(expected)
    })

    it('should preserve encoding when normalizeEncoding option is false', () => {
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, normalizeEncoding: false })
      const expected = 'example.com/path%2Dto%2Dfeed'

      expect(result).toBe(expected)
    })
  })

  describe('Unicode normalization', () => {
    it('should normalize unicode in hostname by default', () => {
      const value = 'https://caf\u00e9.com/feed'
      const result = normalizeUrl(value)
      const expected = 'xn--caf-dma.com/feed'

      expect(result).toBe(expected)
    })

    it('should normalize unicode in pathname by default', () => {
      const value = 'https://example.com/caf\u00e9'
      const result = normalizeUrl(value)
      const expected = 'example.com/caf%C3%A9'

      expect(result).toBe(expected)
    })

    it('should skip unicode normalization when normalizeUnicode option is false', () => {
      const value = 'https://example.com/caf\u00e9'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, normalizeUnicode: false })
      const expected = 'example.com/caf%C3%A9'

      expect(result).toBe(expected)
    })
  })

  describe('Punycode normalization', () => {
    it('should convert IDN to punycode by default', () => {
      const value = 'https://münchen.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'xn--mnchen-3ya.example.com/feed'

      expect(result).toBe(expected)
    })

    it('should convert emoji domain to punycode', () => {
      const value = 'https://🍕.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'xn--vi8h.example.com/feed'

      expect(result).toBe(expected)
    })

    it('should skip punycode conversion when convertToPunycode option is false', () => {
      const value = 'https://münchen.example.com/feed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, convertToPunycode: false })
      const expected = 'xn--mnchen-3ya.example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('Case normalization', () => {
    it('should lowercase hostname by default', () => {
      const value = 'https://EXAMPLE.COM/Feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/Feed'

      expect(result).toBe(expected)
    })

    it('should lowercase hostname (URL API always lowercases)', () => {
      const value = 'https://EXAMPLE.COM/Feed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, lowercaseHostname: false })
      const expected = 'example.com/Feed'

      expect(result).toBe(expected)
    })

    it('should not lowercase pathname', () => {
      const value = 'https://example.com/UPPERCASE/Path'
      const result = normalizeUrl(value)
      const expected = 'example.com/UPPERCASE/Path'

      expect(result).toBe(expected)
    })
  })

  describe('Combined normalizations', () => {
    it('should apply all default normalizations', () => {
      const value =
        'https://user:pass@www.EXAMPLE.COM:443/path//to/feed/?utm_source=test&z=2&a=1#section'
      const result = normalizeUrl(value)
      const expected = 'user:pass@example.com/path/to/feed?a=1&z=2'

      expect(result).toBe(expected)
    })

    it('should apply minimal normalizations when all options are false', () => {
      const value = 'https://www.example.com:8080/feed/'
      const options: NormalizeOptions = {
        stripProtocol: false,
        stripAuthentication: false,
        stripWww: false,
        stripDefaultPorts: false,
        stripTrailingSlash: false,
        stripRootSlash: false,
        collapseSlashes: false,
        stripHash: false,
        stripTextFragment: false,
        sortQueryParams: false,
        stripParams: [],
        stripEmptyQuery: false,
        normalizeUnicode: false,
        lowercaseHostname: false,
      }
      const result = normalizeUrl(value, options)
      const expected = 'https://www.example.com:8080/feed/'

      expect(result).toBe(expected)
    })
  })

  describe('Edge cases', () => {
    it('should handle URL without path (keeps root slash)', () => {
      const value = 'https://example.com'
      const result = normalizeUrl(value)
      const expected = 'example.com/'

      expect(result).toBe(expected)
    })

    it('should handle URL with only query (keeps root slash)', () => {
      const value = 'https://example.com?query=value'
      const result = normalizeUrl(value)
      const expected = 'example.com/?query=value'

      expect(result).toBe(expected)
    })

    it('should handle IPv4 address hosts', () => {
      const value = 'https://192.168.1.1/feed'
      const result = normalizeUrl(value)
      const expected = '192.168.1.1/feed'

      expect(result).toBe(expected)
    })

    it('should handle IPv6 loopback address', () => {
      const value = 'https://[::1]/feed'
      const result = normalizeUrl(value)
      const expected = '[::1]/feed'

      expect(result).toBe(expected)
    })

    it('should handle full IPv6 address', () => {
      const value = 'https://[2001:db8:85a3::8a2e:370:7334]/feed'
      const result = normalizeUrl(value)
      const expected = '[2001:db8:85a3::8a2e:370:7334]/feed'

      expect(result).toBe(expected)
    })

    it('should handle IPv6 address with port', () => {
      const value = 'https://[::1]:8080/feed'
      const result = normalizeUrl(value)
      const expected = '[::1]:8080/feed'

      expect(result).toBe(expected)
    })

    it('should handle localhost', () => {
      const value = 'https://localhost:3000/feed'
      const result = normalizeUrl(value)
      const expected = 'localhost:3000/feed'

      expect(result).toBe(expected)
    })

    it('should handle encoded characters in path', () => {
      const value = 'https://example.com/path%20with%20spaces'
      const result = normalizeUrl(value)
      const expected = 'example.com/path%20with%20spaces'

      expect(result).toBe(expected)
    })

    it('should handle special characters in query values', () => {
      const value = 'https://example.com/feed?q=hello+world&tag=%23test'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?q=hello+world&tag=%23test'

      expect(result).toBe(expected)
    })

    it('should handle multiple query params with same key', () => {
      const value = 'https://example.com/feed?a=1&a=2&a=3'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?a=1&a=2&a=3'

      expect(result).toBe(expected)
    })

    it('should handle query param with no value', () => {
      const value = 'https://example.com/feed?key'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?key='

      expect(result).toBe(expected)
    })

    it('should handle query param with empty value', () => {
      const value = 'https://example.com/feed?key='
      const result = normalizeUrl(value)
      const expected = 'example.com/feed?key='

      expect(result).toBe(expected)
    })

    it('should handle IDN with www prefix', () => {
      const value = 'https://www.münchen.de/feed'
      const result = normalizeUrl(value)
      const expected = 'xn--mnchen-3ya.de/feed'

      expect(result).toBe(expected)
    })

    it('should handle hash with special characters', () => {
      const value = 'https://example.com/feed#section/sub?param=1'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, stripHash: false })
      const expected = 'example.com/feed#section/sub?param=1'

      expect(result).toBe(expected)
    })

    it('should handle very deep paths', () => {
      const value = 'https://example.com/a/b/c/d/e/f/g/h/i/j/feed'
      const result = normalizeUrl(value)
      const expected = 'example.com/a/b/c/d/e/f/g/h/i/j/feed'

      expect(result).toBe(expected)
    })

    it('should handle URL with only hash', () => {
      const value = 'https://example.com/#section'
      const result = normalizeUrl(value)
      const expected = 'example.com/'

      expect(result).toBe(expected)
    })

    it('should handle combining www strip with IDN', () => {
      const value = 'https://www.例え.jp/feed'
      const result = normalizeUrl(value)
      // www is stripped, IDN is converted to punycode
      expect(result).toBe('xn--r8jz45g.jp/feed')
    })
  })

  describe('Invalid inputs', () => {
    it('should return original string for invalid URL', () => {
      const value = 'not a valid url'
      const result = normalizeUrl(value)
      const expected = 'not a valid url'

      expect(result).toBe(expected)
    })

    it('should return original string for empty string', () => {
      const value = ''
      const result = normalizeUrl(value)
      const expected = ''

      expect(result).toBe(expected)
    })

    it('should return original string for relative path', () => {
      const value = '/path/to/feed'
      const result = normalizeUrl(value)
      const expected = '/path/to/feed'

      expect(result).toBe(expected)
    })

    it('should handle malformed URLs gracefully', () => {
      const value = 'https://example.com:not-a-port/feed'
      const result = normalizeUrl(value)
      const expected = 'https://example.com:not-a-port/feed'

      expect(result).toBe(expected)
    })
  })
})

describe('isSimilarUrl', () => {
  describe('Identical URLs', () => {
    it('should return true for identical URLs', () => {
      const value1 = 'https://example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('Protocol differences', () => {
    it('should return true for http vs https', () => {
      const value1 = 'http://example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for protocol difference when stripProtocol option is false', () => {
      const value1 = 'http://example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2, {
        ...defaultNormalizeOptions,
        stripProtocol: false,
      })
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('WWW differences', () => {
    it('should return true for www vs non-www', () => {
      const value1 = 'https://www.example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for www difference when stripWww option is false', () => {
      const value1 = 'https://www.example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2, { ...defaultNormalizeOptions, stripWww: false })
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Trailing slash differences', () => {
    it('should return true for trailing slash vs no trailing slash', () => {
      const value1 = 'https://example.com/feed/'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for trailing slash difference when stripTrailingSlash option is false', () => {
      const value1 = 'https://example.com/feed/'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2, {
        ...defaultNormalizeOptions,
        stripTrailingSlash: false,
        stripRootSlash: false,
      })
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Query parameter differences', () => {
    it('should return true for different query order', () => {
      const value1 = 'https://example.com/feed?a=1&b=2'
      const value2 = 'https://example.com/feed?b=2&a=1'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true when one has tracking params', () => {
      const value1 = 'https://example.com/feed?utm_source=twitter'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for different non-tracking params', () => {
      const value1 = 'https://example.com/feed?page=1'
      const value2 = 'https://example.com/feed?page=2'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Hash differences', () => {
    it('should return true for different hash fragments', () => {
      const value1 = 'https://example.com/feed#section1'
      const value2 = 'https://example.com/feed#section2'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true for hash vs no hash', () => {
      const value1 = 'https://example.com/feed#section'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('Case differences', () => {
    it('should return true for hostname case differences', () => {
      const value1 = 'https://EXAMPLE.COM/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for path case differences', () => {
      const value1 = 'https://example.com/FEED'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Port differences', () => {
    it('should return true for default port vs no port', () => {
      const value1 = 'https://example.com:443/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for different non-default ports', () => {
      const value1 = 'https://example.com:8080/feed'
      const value2 = 'https://example.com:9090/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Path differences', () => {
    it('should return false for different paths', () => {
      const value1 = 'https://example.com/feed'
      const value2 = 'https://example.com/rss'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should return true for multiple slashes vs single slash', () => {
      const value1 = 'https://example.com/path//to///feed'
      const value2 = 'https://example.com/path/to/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('Host differences', () => {
    it('should return false for different hosts', () => {
      const value1 = 'https://example.com/feed'
      const value2 = 'https://other.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should return false for different subdomains', () => {
      const value1 = 'https://blog.example.com/feed'
      const value2 = 'https://news.example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Complex comparisons', () => {
    it('should return true for URLs with multiple normalizable differences', () => {
      const value1 = 'http://www.EXAMPLE.COM:80/path//to/feed/?utm_source=test#section'
      const value2 = 'https://example.com/path/to/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should handle real-world feed URL variations', () => {
      const value1 = 'https://www.blog.example.com/feed.xml?utm_source=feedly'
      const value2 = 'http://blog.example.com/feed.xml'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('Invalid inputs', () => {
    it('should return false for invalid first URL', () => {
      const value1 = 'not a url'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should return false for invalid second URL', () => {
      const value1 = 'https://example.com/feed'
      const value2 = 'not a url'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should return false for both invalid URLs', () => {
      const value1 = 'not a url'
      const value2 = 'also not a url'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should return true for identical invalid strings', () => {
      const value1 = 'not a url'
      const value2 = 'not a url'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return false for empty strings vs valid URL', () => {
      const value1 = ''
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })
  })

  describe('Encoding and IDN comparisons', () => {
    it('should return true for IDN vs punycode', () => {
      const value1 = 'https://münchen.de/feed'
      const value2 = 'https://xn--mnchen-3ya.de/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true for different percent encoding of same char', () => {
      // Both decode to the same path with hyphen
      const value1 = 'https://example.com/path-to-feed'
      const value2 = 'https://example.com/path%2Dto%2Dfeed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true for mixed case hex encoding', () => {
      const value1 = 'https://example.com/path%2fto'
      const value2 = 'https://example.com/path%2Fto'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true for www IDN comparison', () => {
      const value1 = 'https://www.münchen.de/feed'
      const value2 = 'https://xn--mnchen-3ya.de/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should return true for emoji domain vs punycode', () => {
      const value1 = 'https://🍕.example.com/feed'
      const value2 = 'https://xn--vi8h.example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('Real-world feed URL comparisons', () => {
    it('should match YouTube feed with different tracking params', () => {
      const value1 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123'
      const value2 = 'https://youtube.com/feeds/videos.xml?channel_id=UC123&utm_source=feedly'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should match Reddit feed variations', () => {
      const value1 = 'https://www.reddit.com/r/javascript/.rss'
      const value2 = 'http://reddit.com/r/javascript/.rss/'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })

    it('should not match different YouTube channels', () => {
      const value1 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC123'
      const value2 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC456'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should not match feed with different auth', () => {
      const value1 = 'https://user:pass@example.com/feed.xml'
      const value2 = 'https://example.com/feed.xml'
      const result = isSimilarUrl(value1, value2)
      const expected = false

      expect(result).toBe(expected)
    })

    it('should match feed with same auth', () => {
      const value1 = 'https://user:pass@example.com/feed.xml'
      const value2 = 'https://user:pass@example.com/feed.xml'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })
})

describe('defaultFetchFn', () => {
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
    const result = await defaultFetchFn('https://example.com/feed.xml')

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

    await defaultFetchFn('https://example.com/feed.xml')

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

    await defaultFetchFn('https://example.com/feed.xml', { method: 'HEAD' })

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

    await defaultFetchFn('https://example.com/feed.xml', {
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
    const result = await defaultFetchFn('https://example.com/feed.xml')
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
    const result = await defaultFetchFn('https://example.com/feed.xml')

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
    const result = await defaultFetchFn('https://example.com/feed.xml')

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
    const result = await defaultFetchFn('https://example.com/feed.xml')

    expect(result.status).toBe(404)
  })
})
