import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import type { FetchFnResponse, NormalizeOptions, PlatformHandler } from './types.js'
import {
  addMissingProtocol,
  applyPlatformHandlers,
  defaultFetchFn,
  isSimilarUrl,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'

describe('resolveFeedProtocol', () => {
  it('should convert feed:// to https://', () => {
    const value = 'feed://example.com/rss.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should convert rss:// to https://', () => {
    const value = 'rss://example.com/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should convert pcast:// to https://', () => {
    const value = 'pcast://example.com/podcast.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/podcast.xml'

    expect(result).toBe(expected)
  })

  it('should convert itpc:// to https://', () => {
    const value = 'itpc://example.com/podcast.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/podcast.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap feed:https:// to https://', () => {
    const value = 'feed:https://example.com/rss.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap feed:http:// to http://', () => {
    const value = 'feed:http://example.com/rss.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'http://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should unwrap rss:https:// to https://', () => {
    const value = 'rss:https://example.com/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should return https URLs unchanged', () => {
    const value = 'https://example.com/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should return http URLs unchanged', () => {
    const value = 'http://example.com/rss.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'http://example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should return absolute path URLs unchanged', () => {
    const value = '/path/to/feed'
    const result = resolveFeedProtocol(value)
    const expected = '/path/to/feed'

    expect(result).toBe(expected)
  })

  it('should return relative path URLs unchanged', () => {
    const value = 'relative/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'relative/feed.xml'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with paths and query params', () => {
    const value = 'feed://example.com/path/to/feed?format=rss'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/path/to/feed?format=rss'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with ports', () => {
    const value = 'feed://example.com:8080/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com:8080/feed.xml'

    expect(result).toBe(expected)
  })

  it('should handle uppercase feed protocols', () => {
    expect(resolveFeedProtocol('FEED://example.com/rss.xml')).toBe('https://example.com/rss.xml')
    expect(resolveFeedProtocol('Feed://example.com/rss.xml')).toBe('https://example.com/rss.xml')
    expect(resolveFeedProtocol('FEED:https://example.com/rss.xml')).toBe(
      'https://example.com/rss.xml',
    )
    expect(resolveFeedProtocol('RSS://example.com/feed.xml')).toBe('https://example.com/feed.xml')
    expect(resolveFeedProtocol('PCAST://example.com/podcast.xml')).toBe(
      'https://example.com/podcast.xml',
    )
  })

  it('should handle mixed case in wrapped URL protocol', () => {
    expect(resolveFeedProtocol('feed:HTTPS://example.com/rss.xml')).toBe(
      'HTTPS://example.com/rss.xml',
    )
    expect(resolveFeedProtocol('feed:Http://example.com/rss.xml')).toBe(
      'Http://example.com/rss.xml',
    )
  })

  it('should return empty string unchanged', () => {
    expect(resolveFeedProtocol('')).toBe('')
  })

  it('should return malformed feed URL unchanged (no slashes)', () => {
    // feed:example.com is malformed - neither feed://example.com nor feed:https://example.com
    expect(resolveFeedProtocol('feed:example.com')).toBe('feed:example.com')
  })

  it('should handle feed URLs with authentication', () => {
    const value = 'feed://user:pass@example.com/rss.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://user:pass@example.com/rss.xml'

    expect(result).toBe(expected)
  })

  it('should handle feed URLs with hash fragment', () => {
    const value = 'feed://example.com/rss.xml#latest'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/rss.xml#latest'

    expect(result).toBe(expected)
  })

  it('should convert podcast:// to https://', () => {
    const value = 'podcast://example.com/feed.xml'
    const result = resolveFeedProtocol(value)
    const expected = 'https://example.com/feed.xml'

    expect(result).toBe(expected)
  })

  it('should use fallbackProtocol for feed:// URLs', () => {
    expect(resolveFeedProtocol('feed://example.com/feed', 'http')).toBe('http://example.com/feed')
    expect(resolveFeedProtocol('rss://example.com/feed', 'http')).toBe('http://example.com/feed')
  })

  it('should ignore fallbackProtocol for wrapped URLs with explicit protocol', () => {
    expect(resolveFeedProtocol('feed:https://example.com/feed', 'http')).toBe(
      'https://example.com/feed',
    )
    expect(resolveFeedProtocol('feed:http://example.com/feed', 'https')).toBe(
      'http://example.com/feed',
    )
  })
})

describe('addMissingProtocol', () => {
  describe('protocol-relative URLs', () => {
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

  describe('bare domains', () => {
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

  describe('uRLs that should not be modified', () => {
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

  describe('invalid protocol-relative URLs', () => {
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

  describe('additional edge cases', () => {
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
  describe('standard HTTP/HTTPS URLs', () => {
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

  describe('feed protocol resolution (integration with resolveFeedProtocol)', () => {
    it('should convert feed:// to https://', () => {
      expect(resolveUrl('feed://example.com/rss.xml')).toBe('https://example.com/rss.xml')
    })

    it('should unwrap feed:https:// to https://', () => {
      expect(resolveUrl('feed:https://example.com/rss.xml')).toBe('https://example.com/rss.xml')
    })
  })

  describe('protocol-relative URLs (integration with addMissingProtocol)', () => {
    it('should convert // to https:// by default', () => {
      expect(resolveUrl('//example.com/feed.xml')).toBe('https://example.com/feed.xml')
    })

    it('should inherit protocol from base URL', () => {
      expect(resolveUrl('//example.com/feed.xml', 'http://other.com')).toBe(
        'http://example.com/feed.xml',
      )
    })

    it('should return undefined for invalid protocol-relative URLs', () => {
      expect(resolveUrl('//Users/file.xml')).toBeUndefined()
      expect(resolveUrl('//intranet/feed.xml')).toBeUndefined()
    })
  })

  describe('bare domains (integration with addMissingProtocol)', () => {
    it('should add https:// to bare domain', () => {
      expect(resolveUrl('example.com/feed.xml')).toBe('https://example.com/feed.xml')
    })

    it('should handle localhost', () => {
      expect(resolveUrl('localhost:3000/feed.xml')).toBe('https://localhost:3000/feed.xml')
    })
  })

  describe('relative URL resolution with base', () => {
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

  describe('uRL normalization', () => {
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

  describe('additional edge cases', () => {
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

  describe('invalid and rejected inputs', () => {
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

  describe('edge cases', () => {
    it('should trim leading and trailing whitespace', () => {
      expect(resolveUrl('  https://example.com/feed')).toBe('https://example.com/feed')
      expect(resolveUrl('https://example.com/feed  ')).toBe('https://example.com/feed')
    })

    it('should handle tabs and carriage returns in URL', () => {
      expect(resolveUrl('https://example.com/\tfeed')).toBe('https://example.com/feed')
      expect(resolveUrl('https://example.com/\rfeed')).toBe('https://example.com/feed')
    })

    it('should convert backslashes to forward slashes in path', () => {
      expect(resolveUrl('https://example.com\\feed\\rss.xml')).toBe(
        'https://example.com/feed/rss.xml',
      )
    })

    it('should preserve trailing dot in hostname (FQDN)', () => {
      expect(resolveUrl('https://example.com./feed')).toBe('https://example.com./feed')
    })

    it('should handle dot segments and excessive parent traversal', () => {
      expect(resolveUrl('https://example.com/a/./b/../c/feed')).toBe('https://example.com/a/c/feed')
      expect(resolveUrl('https://example.com/../../../feed')).toBe('https://example.com/feed')
    })

    it('should preserve empty path segments', () => {
      expect(resolveUrl('https://example.com///feed///rss')).toBe(
        'https://example.com///feed///rss',
      )
    })

    it('should handle special characters in path and query', () => {
      expect(resolveUrl('https://example.com/user@domain/feed')).toBe(
        'https://example.com/user@domain/feed',
      )
      expect(resolveUrl('https://example.com/time:12:30/feed')).toBe(
        'https://example.com/time:12:30/feed',
      )
      expect(resolveUrl('https://example.com/feed[1]/rss')).toBe('https://example.com/feed[1]/rss')
      expect(resolveUrl('https://example.com/feed?filter=a|b')).toBe(
        'https://example.com/feed?filter=a|b',
      )
    })

    it('should encode null byte in URL path', () => {
      expect(resolveUrl('https://example.com/feed\x00.xml')).toBe('https://example.com/feed%00.xml')
    })

    it('should handle unicode control characters', () => {
      expect(resolveUrl('https://example.com/fe\u200Bed')).toBeDefined()
      expect(resolveUrl('https://example.com/\u202Efeed')).toBeDefined()
    })
  })
})

describe('normalizeUrl', () => {
  describe('protocol stripping', () => {
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

  describe('authentication handling', () => {
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

  describe('wWW stripping', () => {
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

    it('should not affect non-www subdomains', () => {
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

  describe('port stripping', () => {
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

  describe('trailing slash removal', () => {
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

  describe('single slash (root path) handling', () => {
    it('should keep root slash (URL API limitation)', () => {
      const value = 'https://example.com/'
      const result = normalizeUrl(value)
      const expected = 'example.com/'

      expect(result).toBe(expected)
    })
  })

  describe('multiple slashes collapsing', () => {
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

  describe('hash/fragment stripping', () => {
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

  describe('text fragment stripping', () => {
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

  describe('query parameter sorting', () => {
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

  describe('tracking parameter stripping', () => {
    it('should strip default tracking parameters', () => {
      const value = 'https://example.com/feed?utm_source=twitter&fbclid=abc&id=123'
      const result = normalizeUrl(value)

      expect(result).toBe('example.com/feed?id=123')
    })

    it('should use custom stripped params when array is provided', () => {
      const value = 'https://example.com/feed?custom=1&keep=2'
      const result = normalizeUrl(value, {
        ...defaultNormalizeOptions,
        stripQueryParams: ['custom'],
      })

      expect(result).toBe('example.com/feed?keep=2')
    })
  })

  describe('empty query removal', () => {
    it('should remove empty query string by default', () => {
      const value = 'https://example.com/feed?'
      const result = normalizeUrl(value)
      const expected = 'example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('percent encoding normalization', () => {
    it('should decode unnecessarily encoded safe chars by default', () => {
      // %2D is '-', which is safe in paths
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const result = normalizeUrl(value)
      const expected = 'example.com/path-to-feed'

      expect(result).toBe(expected)
    })

    it('should normalize lowercase hex to uppercase', () => {
      // %2f should become %2F (forward slash must stay encoded)
      const value = 'https://example.com/path%2fencoded'
      const result = normalizeUrl(value)
      const expected = 'example.com/path%2Fencoded'

      expect(result).toBe(expected)
    })

    it('should keep unsafe characters encoded', () => {
      // %20 (space) should stay encoded
      const value = 'https://example.com/hello%20world'
      const result = normalizeUrl(value)
      const expected = 'example.com/hello%20world'

      expect(result).toBe(expected)
    })

    it('should preserve encoding when normalizeEncoding option is false', () => {
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const result = normalizeUrl(value, { ...defaultNormalizeOptions, normalizeEncoding: false })
      const expected = 'example.com/path%2Dto%2Dfeed'

      expect(result).toBe(expected)
    })
  })

  describe('unicode normalization', () => {
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

  describe('punycode normalization', () => {
    it('should convert IDN to punycode by default', () => {
      const value = 'https://münchen.example.com/feed'
      const result = normalizeUrl(value)
      const expected = 'xn--mnchen-3ya.example.com/feed'

      expect(result).toBe(expected)
    })
  })

  describe('case normalization', () => {
    it('should lowercase hostname by default', () => {
      const value = 'https://EXAMPLE.COM/Feed'
      const result = normalizeUrl(value)
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

  describe('combined normalizations', () => {
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
        stripQueryParams: [],
        stripEmptyQuery: false,
        normalizeUnicode: false,
        lowercaseHostname: false,
      }
      const result = normalizeUrl(value, options)
      const expected = 'https://www.example.com:8080/feed/'

      expect(result).toBe(expected)
    })
  })

  describe('edge cases', () => {
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

    it('should handle IPv6 address hosts', () => {
      const value = 'https://[::1]/feed'
      const result = normalizeUrl(value)
      const expected = '[::1]/feed'

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

    it('should preserve matrix parameters in path', () => {
      expect(normalizeUrl('https://example.com/feed;type=rss')).toBe('example.com/feed;type=rss')
      expect(normalizeUrl('https://example.com/feed;a=1;b=2')).toBe('example.com/feed;a=1;b=2')
    })

    it('should encode special characters in query param values', () => {
      expect(normalizeUrl('https://example.com/feed?expr=a=b')).toBe('example.com/feed?expr=a%3Db')
      expect(normalizeUrl('https://example.com/feed?q=a%26b')).toBe('example.com/feed?q=a%26b')
      expect(normalizeUrl('https://example.com/feed?q=日本語')).toBe(
        'example.com/feed?q=%E6%97%A5%E6%9C%AC%E8%AA%9E',
      )
    })

    it('should handle unencoded and mixed encoding in path', () => {
      expect(normalizeUrl('https://example.com/path with spaces')).toBe(
        'example.com/path%20with%20spaces',
      )
      expect(normalizeUrl('https://example.com/a%2Fb/c')).toBe('example.com/a%2Fb/c')
    })
  })

  describe('invalid inputs', () => {
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
  describe('identical URLs', () => {
    it('should return true for identical URLs', () => {
      const value1 = 'https://example.com/feed'
      const value2 = 'https://example.com/feed'
      const result = isSimilarUrl(value1, value2)
      const expected = true

      expect(result).toBe(expected)
    })
  })

  describe('protocol differences', () => {
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

  describe('wWW differences', () => {
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

  describe('trailing slash differences', () => {
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

  describe('query parameter differences', () => {
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

  describe('hash differences', () => {
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

  describe('case differences', () => {
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

  describe('port differences', () => {
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

  describe('path differences', () => {
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

  describe('host differences', () => {
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

  describe('complex comparisons', () => {
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

  describe('invalid inputs', () => {
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

  describe('encoding and IDN comparisons', () => {
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

  describe('real-world feed URL comparisons', () => {
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

describe('applyPlatformHandlers', () => {
  const createHandler = (matchHostname: string, newHostname: string): PlatformHandler => {
    return {
      match: (url) => {
        return url.hostname === matchHostname
      },
      normalize: (url) => {
        const normalized = new URL(url.href)
        normalized.hostname = newHostname
        return normalized
      },
    }
  }

  it('should apply matching handler', () => {
    const value = 'https://old.example.com/feed'
    const handlers = [createHandler('old.example.com', 'new.example.com')]
    const result = applyPlatformHandlers(value, handlers)
    const expected = 'https://new.example.com/feed'

    expect(result).toBe(expected)
  })

  it('should apply first matching handler when multiple match', () => {
    const value = 'https://multi.example.com/feed'
    const handlers = [
      createHandler('multi.example.com', 'first.example.com'),
      createHandler('multi.example.com', 'second.example.com'),
    ]
    const result = applyPlatformHandlers(value, handlers)
    const expected = 'https://first.example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original URL when no handler matches', () => {
    const value = 'https://example.com/feed'
    const handlers = [createHandler('other.example.com', 'new.example.com')]
    const result = applyPlatformHandlers(value, handlers)
    const expected = 'https://example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original URL when handlers array is empty', () => {
    const value = 'https://example.com/feed'
    const handlers: Array<PlatformHandler> = []
    const result = applyPlatformHandlers(value, handlers)
    const expected = 'https://example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original string for invalid URL', () => {
    const value = 'not a valid url'
    const handlers = [createHandler('example.com', 'new.example.com')]
    const result = applyPlatformHandlers(value, handlers)
    const expected = 'not a valid url'

    expect(result).toBe(expected)
  })
})
