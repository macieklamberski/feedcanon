import { describe, expect, it } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import type { NormalizeOptions, Rewrite } from './types.js'
import {
  addMissingProtocol,
  applyRewrites,
  fixMalformedProtocol,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'

describe('resolveFeedProtocol', () => {
  it('should convert feed:// to https://', () => {
    const value = 'feed://example.com/rss.xml'
    const expected = 'https://example.com/rss.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should convert rss:// to https://', () => {
    const value = 'rss://example.com/feed.xml'
    const expected = 'https://example.com/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should convert pcast:// to https://', () => {
    const value = 'pcast://example.com/podcast.xml'
    const expected = 'https://example.com/podcast.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should convert itpc:// to https://', () => {
    const value = 'itpc://example.com/podcast.xml'
    const expected = 'https://example.com/podcast.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should convert podcast:// to https://', () => {
    const value = 'podcast://example.com/feed.xml'
    const expected = 'https://example.com/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should unwrap feed:https:// to https://', () => {
    const value = 'feed:https://example.com/rss.xml'
    const expected = 'https://example.com/rss.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should unwrap feed:http:// to http://', () => {
    const value = 'feed:http://example.com/rss.xml'
    const expected = 'http://example.com/rss.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should unwrap rss:https:// to https://', () => {
    const value = 'rss:https://example.com/feed.xml'
    const expected = 'https://example.com/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should return https URLs unchanged', () => {
    const value = 'https://example.com/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(value)
  })

  it('should return http URLs unchanged', () => {
    const value = 'http://example.com/rss.xml'

    expect(resolveFeedProtocol(value)).toBe(value)
  })

  it('should return absolute path URLs unchanged', () => {
    const value = '/path/to/feed'

    expect(resolveFeedProtocol(value)).toBe(value)
  })

  it('should return relative path URLs unchanged', () => {
    const value = 'relative/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(value)
  })

  it('should handle feed URLs with paths and query params', () => {
    const value = 'feed://example.com/path/to/feed?format=rss'
    const expected = 'https://example.com/path/to/feed?format=rss'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should handle feed URLs with ports', () => {
    const value = 'feed://example.com:8080/feed.xml'
    const expected = 'https://example.com:8080/feed.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
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

  it('should return malformed feed URL unchanged', () => {
    const value = 'feed:example.com'

    expect(resolveFeedProtocol(value)).toBe(value)
  })

  it('should handle feed URLs with authentication', () => {
    const value = 'feed://user:pass@example.com/rss.xml'
    const expected = 'https://user:pass@example.com/rss.xml'

    expect(resolveFeedProtocol(value)).toBe(expected)
  })

  it('should handle feed URLs with hash fragment', () => {
    const value = 'feed://example.com/rss.xml#latest'
    const expected = 'https://example.com/rss.xml#latest'

    expect(resolveFeedProtocol(value)).toBe(expected)
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

describe('fixMalformedProtocol', () => {
  it('should strip leading slash before protocol', () => {
    const values = [
      { value: '/http://example.com', expected: 'http://example.com' },
      { value: '/https://example.com', expected: 'https://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix protocol typos', () => {
    const values = [
      { value: 'htp://example.com', expected: 'http://example.com' },
      { value: 'htps://example.com', expected: 'https://example.com' },
      { value: 'hhttps://example.com', expected: 'https://example.com' },
      { value: 'httpss://example.com', expected: 'https://example.com' },
      { value: 'ttp://example.com', expected: 'http://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix wrong separators after protocol', () => {
    const values = [
      { value: 'http=//example.com', expected: 'http://example.com' },
      { value: 'http.//example.com', expected: 'http://example.com' },
      { value: 'http\\//example.com', expected: 'http://example.com' },
      { value: 'https=//example.com', expected: 'https://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix single slash after protocol', () => {
    const values = [
      { value: 'http:/example.com', expected: 'http://example.com' },
      { value: 'https:/example.com', expected: 'https://example.com' },
      { value: 'http:/www.example.com', expected: 'http://www.example.com' },
      { value: 'https:/example.com/feed', expected: 'https://example.com/feed' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix multiple colons and slashes', () => {
    const values = [
      { value: 'http:://example.com', expected: 'http://example.com' },
      { value: 'http:///example.com', expected: 'http://example.com' },
      { value: 'http:////example.com', expected: 'http://example.com' },
      { value: 'https:::///example.com', expected: 'https://example.com' },
      { value: 'http://///example.com', expected: 'http://example.com' },
      { value: 'https://////www.example.com', expected: 'https://www.example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should remove leading junk after protocol', () => {
    const values = [
      { value: 'http://./example.com', expected: 'http://example.com' },
      { value: 'http://,example.com', expected: 'http://example.com' },
      { value: 'https://...example.com', expected: 'https://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix placeholder syntax', () => {
    const values = [
      { value: 'http(s)://example.com', expected: 'https://example.com' },
      { value: 'HTTP(S)://example.com/feed', expected: 'https://example.com/feed' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix colon within protocol letters', () => {
    const values = [
      { value: 'http:s//example.com', expected: 'https://example.com' },
      { value: 'https:s//example.com', expected: 'https://example.com' },
      { value: 'ht:tps//example.com', expected: 'https://example.com' },
      { value: 'htt:p//example.com', expected: 'http://example.com' },
      { value: 'h:ttp//example.com', expected: 'http://example.com' },
      { value: 'ht:tp//example.com', expected: 'http://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix double protocol prefix', () => {
    const values = [
      { value: 'http:http://example.com', expected: 'http://example.com' },
      { value: 'https:https://example.com', expected: 'https://example.com' },
      { value: 'http:https://example.com', expected: 'https://example.com' },
      { value: 'https:http://example.com', expected: 'http://example.com' },
      { value: 'http::http://example.com', expected: 'http://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix misplaced www after protocol', () => {
    const values = [
      { value: 'http:www.//example.com', expected: 'http://www.example.com' },
      { value: 'https:www.//example.com', expected: 'https://www.example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix missing dot after www', () => {
    const values = [
      { value: 'http://www/example.com', expected: 'http://www.example.com' },
      { value: 'https://www/example.com/feed', expected: 'https://www.example.com/feed' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix nested double protocols', () => {
    const values = [
      { value: 'http://https//example.com', expected: 'https://example.com' },
      { value: 'http://https/example.com', expected: 'https://example.com' },
      { value: 'https://https//example.com', expected: 'https://example.com' },
      { value: 'http://http/example.com', expected: 'http://example.com' },
      { value: 'http://http//example.com', expected: 'http://example.com' },
      { value: 'http://ttp://example.com', expected: 'http://example.com' },
      { value: 'http://ttps://example.com', expected: 'https://example.com' },
      { value: 'htp://ttps://example.com', expected: 'https://example.com' },
      { value: 'htps://ttp://example.com', expected: 'http://example.com' },
      { value: 'hs://hp://example.com', expected: 'http://example.com' },
      { value: 'httpss://htps://example.com', expected: 'https://example.com' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should fix stray colon after protocol slashes', () => {
    const values = [
      { value: 'http://:/example.com', expected: 'http://example.com' },
      { value: 'https://:/example.com', expected: 'https://example.com' },
      { value: 'http://:/path/to/feed', expected: 'http://path/to/feed' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should preserve port numbers when fixing protocol typos', () => {
    const values = [
      { value: 'htp://example.com:8080', expected: 'http://example.com:8080' },
      { value: 'htps://example.com:443/feed', expected: 'https://example.com:443/feed' },
      { value: 'hhttps://example.com:3000', expected: 'https://example.com:3000' },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should preserve query strings when fixing protocol typos', () => {
    const values = [
      { value: 'htp://example.com?a=1', expected: 'http://example.com?a=1' },
      {
        value: 'htps://example.com/feed?format=rss&id=123',
        expected: 'https://example.com/feed?format=rss&id=123',
      },
      {
        value: 'hhttps://example.com?foo=bar#anchor',
        expected: 'https://example.com?foo=bar#anchor',
      },
    ]

    for (const { value, expected } of values) {
      expect(fixMalformedProtocol(value)).toBe(expected)
    }
  })

  it('should not modify protocol-like strings in path', () => {
    const values = [
      'http://example.com/path/http://file',
      'https://example.com/redirect?url=http://other.com',
      'http://example.com/api/https://callback',
    ]

    for (const value of values) {
      expect(fixMalformedProtocol(value)).toBe(value)
    }
  })

  it('should preserve non-HTTP protocols unchanged', () => {
    const values = [
      'ftp://example.com/file',
      'mailto:user@example.com',
      'file:///path/to/file',
      'data:text/plain;base64,SGVsbG8=',
      'tel:+1234567890',
    ]

    for (const value of values) {
      expect(fixMalformedProtocol(value)).toBe(value)
    }
  })

  it('should preserve valid URLs unchanged', () => {
    const values = [
      'http://example.com',
      'https://example.com',
      'http://example.com/path/to/feed',
      'https://example.com/feed?format=rss',
      'http://example.com:8080/feed',
      'ftp://example.com/file',
      '/path/to/feed',
    ]

    for (const value of values) {
      expect(fixMalformedProtocol(value)).toBe(value)
    }
  })
})

describe('addMissingProtocol', () => {
  describe('protocol-relative URLs', () => {
    const values = [
      { value: '//example.com/feed', expected: 'https://example.com/feed' },
      { value: '//cdn.example.com/style.css', expected: 'https://cdn.example.com/style.css' },
      { value: '//localhost/api', expected: 'https://localhost/api' },
      { value: '//192.168.1.1/api', expected: 'https://192.168.1.1/api' },
      { value: '//example.com:8080/feed', expected: 'https://example.com:8080/feed' },
      { value: '//[::1]/feed', expected: 'https://[::1]/feed' },
      { value: '//[2001:db8::1]/feed', expected: 'https://[2001:db8::1]/feed' },
    ]

    for (const { value, expected } of values) {
      it(`should convert ${value} to ${expected}`, () => {
        expect(addMissingProtocol(value)).toBe(expected)
      })
    }

    it('should use http when specified', () => {
      const value = '//example.com/feed'
      const expected = 'http://example.com/feed'

      expect(addMissingProtocol(value, 'http')).toBe(expected)
    })
  })

  describe('bare domains', () => {
    it('should add https:// to domain without protocol', () => {
      const value = 'example.com/feed'
      const expected = 'https://example.com/feed'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should add https:// to domain with subdomain', () => {
      const value = 'www.example.com/feed.xml'
      const expected = 'https://www.example.com/feed.xml'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should use http when specified', () => {
      const value = 'example.com/feed'
      const expected = 'http://example.com/feed'

      expect(addMissingProtocol(value, 'http')).toBe(expected)
    })

    it('should handle domain with query string', () => {
      const value = 'example.com/feed?format=rss'
      const expected = 'https://example.com/feed?format=rss'

      expect(addMissingProtocol(value)).toBe(expected)
    })
  })

  describe('URLs that should not be modified', () => {
    it('should not modify http:// URLs', () => {
      const value = 'http://example.com/feed'

      expect(addMissingProtocol(value)).toBe(value)
    })

    it('should not modify https:// URLs', () => {
      const value = 'https://example.com/feed'

      expect(addMissingProtocol(value)).toBe(value)
    })

    it('should not modify absolute path URLs', () => {
      const value = '/path/to/feed'

      expect(addMissingProtocol(value)).toBe(value)
    })

    it('should not modify relative path URLs starting with dot', () => {
      const value = './feed.xml'

      expect(addMissingProtocol(value)).toBe(value)
    })

    it('should not modify relative path URLs starting with double dot', () => {
      const value = '../feed.xml'

      expect(addMissingProtocol(value)).toBe(value)
    })

    it('should handle localhost', () => {
      expect(addMissingProtocol('localhost')).toBe('https://localhost')
      expect(addMissingProtocol('localhost/')).toBe('https://localhost/')
      expect(addMissingProtocol('localhost:3000')).toBe('https://localhost:3000')
    })
  })

  describe('invalid protocol-relative URLs', () => {
    const values = ['//Users/file.xml', '//home/user/file.txt', '///triple-slash', '//singlelabel']

    for (const value of values) {
      it(`should return ${value} unchanged`, () => {
        expect(addMissingProtocol(value)).toBe(value)
      })
    }

    it('should handle malformed URLs gracefully', () => {
      const value = '//not valid url $#@'

      expect(addMissingProtocol(value)).toBe(value)
    })
  })

  describe('additional edge cases', () => {
    it('should handle bare domain with hash', () => {
      const value = 'example.com/feed#section'
      const expected = 'https://example.com/feed#section'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should not modify feed:// URLs', () => {
      expect(addMissingProtocol('feed://example.com/rss')).toBe('feed://example.com/rss')
      expect(addMissingProtocol('rss://example.com/feed')).toBe('rss://example.com/feed')
    })

    it('should handle domain with many subdomains', () => {
      const value = 'a.b.c.d.example.com/feed'
      const expected = 'https://a.b.c.d.example.com/feed'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should handle IDN bare domain', () => {
      const value = 'münchen.de/feed'
      const expected = 'https://münchen.de/feed'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should handle protocol-relative with query', () => {
      const value = '//example.com/feed?format=rss&page=1'
      const expected = 'https://example.com/feed?format=rss&page=1'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should handle bare domain without path', () => {
      const value = 'example.com'
      const expected = 'https://example.com'

      expect(addMissingProtocol(value)).toBe(expected)
    })

    it('should not modify mailto: URLs', () => {
      expect(addMissingProtocol('mailto:test@example.com')).toBe('mailto:test@example.com')
    })

    it('should not modify data: URLs', () => {
      expect(addMissingProtocol('data:text/html,<h1>Test</h1>')).toBe(
        'data:text/html,<h1>Test</h1>',
      )
    })

    it('should return URLs with leading whitespace unchanged', () => {
      expect(addMissingProtocol(' example.com')).toBe(' example.com')
      expect(addMissingProtocol('\texample.com')).toBe('\texample.com')
      expect(addMissingProtocol('\nexample.com')).toBe('\nexample.com')
    })
  })
})

describe('resolveUrl', () => {
  describe('HTML entity decoding', () => {
    it('should decode &amp; to &', () => {
      const value = 'https://example.com/feed?a=1&amp;b=2'
      const expected = 'https://example.com/feed?a=1&b=2'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should decode numeric entities', () => {
      const value = 'https://example.com/feed&#x3F;query=1'
      const expected = 'https://example.com/feed?query=1'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should decode named entities', () => {
      const value = 'https://example.com/feed?q=a&lt;b'
      const expected = 'https://example.com/feed?q=a%3Cb'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should decode entities in path', () => {
      const value = 'https://example.com/path&amp;name/feed'
      const expected = 'https://example.com/path&name/feed'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should handle multiple encoded ampersands', () => {
      const value = 'https://example.com/feed?a=1&amp;b=2&amp;c=3'
      const expected = 'https://example.com/feed?a=1&b=2&c=3'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should decode accented character entities', () => {
      const value = 'https://example.com/caf&eacute;'
      const expected = 'https://example.com/caf%C3%A9'

      expect(resolveUrl(value)).toBe(expected)
    })
  })

  describe('standard HTTP/HTTPS URLs', () => {
    it('should return https URL unchanged', () => {
      const value = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should return http URL unchanged', () => {
      const value = 'http://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should preserve query parameters', () => {
      const value = 'https://example.com/feed?format=rss&page=1'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should preserve hash fragments', () => {
      const value = 'https://example.com/feed#latest'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should preserve authentication credentials', () => {
      const value = 'https://user:pass@example.com/feed.xml'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should preserve non-standard ports', () => {
      const value = 'https://example.com:8443/feed.xml'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should strip default HTTPS port', () => {
      const value = 'https://example.com:443/feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should strip default HTTP port', () => {
      const value = 'http://example.com:80/feed.xml'
      const expected = 'http://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })
  })

  describe('feed protocol resolution', () => {
    it('should convert feed:// to https://', () => {
      const value = 'feed://example.com/rss.xml'
      const expected = 'https://example.com/rss.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should unwrap feed:https:// to https://', () => {
      const value = 'feed:https://example.com/rss.xml'
      const expected = 'https://example.com/rss.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should convert rss:// to https://', () => {
      const value = 'rss://example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })
  })

  describe('protocol-relative URLs', () => {
    it('should convert // to https:// by default', () => {
      const value = '//example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should inherit protocol from base URL', () => {
      const value = '//example.com/feed.xml'
      const base = 'http://other.com'
      const expected = 'http://example.com/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should return undefined for invalid protocol-relative URLs', () => {
      expect(resolveUrl('//Users/file.xml')).toBeUndefined()
      expect(resolveUrl('//intranet/feed.xml')).toBeUndefined()
    })
  })

  describe('bare domains', () => {
    it('should add https:// to bare domain', () => {
      const value = 'example.com/feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should handle localhost', () => {
      const value = 'localhost:3000/feed.xml'
      const expected = 'https://localhost:3000/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })
  })

  describe('relative URL resolution with base', () => {
    const base = 'https://example.com/blog/posts/'

    it('should resolve simple filename', () => {
      const value = 'feed.xml'
      const expected = 'https://example.com/blog/posts/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should resolve current directory reference', () => {
      const value = './feed.xml'
      const expected = 'https://example.com/blog/posts/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should resolve single parent directory', () => {
      const value = '../feed.xml'
      const expected = 'https://example.com/blog/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should resolve multiple parent directories', () => {
      const value = '../../feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should resolve root-relative path', () => {
      const value = '/feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should resolve query-only reference', () => {
      const value = '?format=atom'
      const expected = 'https://example.com/blog/posts/?format=atom'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should not modify absolute URL when base is provided', () => {
      const value = 'https://other.com/feed.xml'

      expect(resolveUrl(value, base)).toBe(value)
    })

    it('should convert feed:// URL when base is provided', () => {
      const value = 'feed://other.com/feed.xml'
      const expected = 'https://other.com/feed.xml'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should inherit http from base when resolving relative URL', () => {
      const value = 'feed.xml'
      const expected = 'http://example.com/blog/feed.xml'

      expect(resolveUrl(value, 'http://example.com/blog/')).toBe(expected)
    })
  })

  describe('URL normalization', () => {
    it('should normalize path segments (/../)', () => {
      const value = 'https://example.com/a/b/../feed.xml'
      const expected = 'https://example.com/a/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should normalize path segments (/./)', () => {
      const value = 'https://example.com/./feed.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should lowercase hostname', () => {
      const value = 'https://EXAMPLE.COM/Feed.xml'
      const expected = 'https://example.com/Feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should preserve path case', () => {
      const value = 'https://example.com/Blog/Feed.XML'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should add trailing slash to root path', () => {
      const value = 'https://example.com'
      const expected = 'https://example.com/'

      expect(resolveUrl(value)).toBe(expected)
    })
  })

  describe('additional edge cases', () => {
    it('should handle hash-only reference with base', () => {
      const value = '#section'
      const base = 'https://example.com/page'
      const expected = 'https://example.com/page#section'

      expect(resolveUrl(value, base)).toBe(expected)
    })

    it('should return undefined for invalid base URL', () => {
      const value = 'feed.xml'
      const base = 'not a valid base'

      expect(resolveUrl(value, base)).toBeUndefined()
    })

    it('should handle double-encoded characters', () => {
      const value = 'https://example.com/path%2520with%2520spaces'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should handle URLs with unicode in path', () => {
      const value = 'https://example.com/café/feed'
      const expected = 'https://example.com/caf%C3%A9/feed'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should handle URLs with special query characters', () => {
      const value = 'https://example.com/feed?q=hello%20world&tag=%23test'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should handle URLs with embedded newline', () => {
      const value = 'https://example.com/feed\n.xml'
      const expected = 'https://example.com/feed.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should handle bare domain with very long TLD', () => {
      const value = 'example.photography/feed'
      const expected = 'https://example.photography/feed'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should handle URL with empty path segments', () => {
      const value = 'https://example.com//feed//rss.xml'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should apply entity decoding and protocol conversion together', () => {
      const value = 'feed:https://example.com/feed?x=1&amp;y=2'
      const expected = 'https://example.com/feed?x=1&y=2'

      expect(resolveUrl(value)).toBe(expected)
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
      const value = 'https://example.com\\feed\\rss.xml'
      const expected = 'https://example.com/feed/rss.xml'

      expect(resolveUrl(value)).toBe(expected)
    })

    it('should preserve trailing dot in hostname', () => {
      const value = 'https://example.com./feed'

      expect(resolveUrl(value)).toBe(value)
    })

    it('should handle dot segments and excessive parent traversal', () => {
      expect(resolveUrl('https://example.com/a/./b/../c/feed')).toBe('https://example.com/a/c/feed')
      expect(resolveUrl('https://example.com/../../../feed')).toBe('https://example.com/feed')
    })

    it('should preserve empty path segments', () => {
      const value = 'https://example.com///feed///rss'

      expect(resolveUrl(value)).toBe(value)
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
      const value = 'https://example.com/feed\x00.xml'
      const expected = 'https://example.com/feed%00.xml'

      expect(resolveUrl(value)).toBe(expected)
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
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should strip http:// protocol by default', () => {
      const value = 'http://example.com/feed'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve protocol when stripProtocol is false', () => {
      const value = 'https://example.com/feed'
      const options = { stripProtocol: false }

      expect(normalizeUrl(value, options)).toBe(value)
    })
  })

  describe('authentication handling', () => {
    it('should preserve username and password by default', () => {
      const value = 'https://user:pass@example.com/feed'
      const expected = 'user:pass@example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve username only by default', () => {
      const value = 'https://user@example.com/feed'
      const expected = 'user@example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should strip authentication when stripAuthentication is true', () => {
      const value = 'https://user:pass@example.com/feed'
      const options = { stripAuthentication: true, stripProtocol: false }
      const expected = 'https://example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('www stripping', () => {
    it('should strip www prefix by default', () => {
      const value = 'https://www.example.com/feed'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve www when stripWww is false', () => {
      const value = 'https://www.example.com/feed'
      const options = { ...defaultNormalizeOptions, stripWww: false }
      const expected = 'www.example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should not affect non-www subdomains', () => {
      const value = 'https://cdn.example.com/feed'
      const expected = 'cdn.example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle www in subdomain correctly', () => {
      const value = 'https://www.blog.example.com/feed'
      const expected = 'blog.example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('port stripping', () => {
    it('should strip default HTTPS port 443', () => {
      const value = 'https://example.com:443/feed'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should strip default HTTP port 80', () => {
      const value = 'http://example.com:80/feed'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve non-default ports', () => {
      const value = 'https://example.com:8080/feed'
      const expected = 'example.com:8080/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should not strip port 80 for HTTPS', () => {
      const value = 'https://example.com:80/feed'
      const expected = 'example.com:80/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should not strip port 443 for HTTP', () => {
      const value = 'http://example.com:443/feed'
      const expected = 'example.com:443/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('trailing slash removal', () => {
    it('should remove trailing slash from path by default', () => {
      const value = 'https://example.com/feed/'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve trailing slash when stripTrailingSlash is false', () => {
      const value = 'https://example.com/feed/'
      const options = {
        ...defaultNormalizeOptions,
        stripTrailingSlash: false,
        stripRootSlash: false,
      }
      const expected = 'example.com/feed/'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should handle multiple trailing slashes after collapse', () => {
      const value = 'https://example.com/feed///'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('single slash (root path) handling', () => {
    it('should strip root slash by default', () => {
      const value = 'https://example.com/'
      const expected = 'example.com'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should strip root slash from URL without trailing slash', () => {
      const value = 'https://example.com'
      const expected = 'example.com'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve root slash when stripRootSlash is false', () => {
      const value = 'https://example.com/'
      const options = { ...defaultNormalizeOptions, stripRootSlash: false }
      const expected = 'example.com/'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should preserve path when stripping root slash', () => {
      const value = 'https://example.com/path'
      const expected = 'example.com/path'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve slash before query string', () => {
      const value = 'https://example.com/?a=1'
      const expected = 'example.com/?a=1'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should strip root slash with port number', () => {
      const value = 'https://example.com:8080/'
      const expected = 'example.com:8080'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('multiple slashes collapsing', () => {
    it('should collapse multiple slashes in path by default', () => {
      const value = 'https://example.com/path//to///feed'
      const expected = 'example.com/path/to/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve multiple slashes when collapseSlashes is false', () => {
      const value = 'https://example.com/path//to///feed'
      const options = { ...defaultNormalizeOptions, collapseSlashes: false }
      const expected = 'example.com/path//to///feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('hash/fragment stripping', () => {
    it('should strip hash fragment by default', () => {
      const value = 'https://example.com/feed#section'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve hash when stripHash is false', () => {
      const value = 'https://example.com/feed#section'
      const options = { ...defaultNormalizeOptions, stripHash: false }
      const expected = 'example.com/feed#section'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should handle empty hash', () => {
      const value = 'https://example.com/feed#'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('query parameter sorting', () => {
    it('should sort query parameters alphabetically by default', () => {
      const value = 'https://example.com/feed?z=3&a=1&m=2'
      const expected = 'example.com/feed?a=1&m=2&z=3'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve query order when sortQueryParams is false', () => {
      const value = 'https://example.com/feed?z=3&a=1&m=2'
      const options = { ...defaultNormalizeOptions, sortQueryParams: false }
      const expected = 'example.com/feed?z=3&a=1&m=2'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('tracking parameter stripping', () => {
    it('should strip default tracking parameters', () => {
      const value = 'https://example.com/feed?utm_source=twitter&fbclid=abc&id=123'
      const expected = 'example.com/feed?id=123'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should use custom stripped params when array is provided', () => {
      const value = 'https://example.com/feed?custom=1&keep=2'
      const options = { ...defaultNormalizeOptions, stripQueryParams: ['custom'] }
      const expected = 'example.com/feed?keep=2'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should strip uppercase tracking parameters', () => {
      const value = 'https://example.com/feed?UTM_SOURCE=twitter&FBCLID=abc&id=123'
      const options = { ...defaultNormalizeOptions, stripQueryParams: ['utm_source', 'fbclid'] }
      const expected = 'example.com/feed?id=123'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should strip mixed case tracking parameters', () => {
      const value = 'https://example.com/feed?Utm_Source=twitter&FbClId=abc&id=123'
      const options = { ...defaultNormalizeOptions, stripQueryParams: ['utm_source', 'fbclid'] }
      const expected = 'example.com/feed?id=123'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should strip params case-insensitively with multiple variants', () => {
      const value = 'https://example.com/feed?CUSTOM=1&Custom=2&custom=3&keep=4'
      const options = { ...defaultNormalizeOptions, stripQueryParams: ['custom'] }
      const expected = 'example.com/feed?keep=4'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('query string stripping', () => {
    it('should strip entire query string when stripQuery is true', () => {
      const value = 'https://example.com/feed?a=1&b=2&c=3'
      const options = { ...defaultNormalizeOptions, stripQuery: true }
      const expected = 'example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should preserve query string by default', () => {
      const value = 'https://example.com/feed?id=123'
      const expected = 'example.com/feed?id=123'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('self-referential ref param stripping', () => {
    it('should strip ref when value matches hostname', () => {
      const value = 'https://example.com/feed?ref=example.com'
      const options = { stripSelfRefParam: true }
      const expected = 'https://example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should strip ref when value matches hostname with www', () => {
      const value = 'https://www.example.com/feed?ref=example.com'
      const options = { stripSelfRefParam: true }
      const expected = 'https://www.example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should strip ref when URL has www but value does not', () => {
      const value = 'https://example.com/feed?ref=www.example.com'
      const options = { stripSelfRefParam: true }
      const expected = 'https://example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should preserve ref when value differs from hostname', () => {
      const value = 'https://example.com/feed?ref=other.com'
      const options = { stripSelfRefParam: true }

      expect(normalizeUrl(value, options)).toBe(value)
    })

    it('should preserve ref when option is disabled', () => {
      const value = 'https://example.com/feed?ref=example.com'
      const options = { stripSelfRefParam: false }

      expect(normalizeUrl(value, options)).toBe(value)
    })

    it('should strip self-referential ref by default', () => {
      const value = 'https://example.com/feed?ref=example.com'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('empty query removal', () => {
    it('should remove empty query string by default', () => {
      const value = 'https://example.com/feed?'
      const expected = 'example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should remove empty query string when sortQueryParams is false', () => {
      const value = 'https://example.com/feed?'
      const options = { ...defaultNormalizeOptions, sortQueryParams: false }
      const expected = 'example.com/feed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should preserve empty query string when stripEmptyQuery is false', () => {
      const value = 'https://example.com/feed?'
      const options = { ...defaultNormalizeOptions, sortQueryParams: false, stripEmptyQuery: false }
      const expected = 'example.com/feed?'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('percent encoding normalization', () => {
    it('should decode unnecessarily encoded safe chars by default', () => {
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const expected = 'example.com/path-to-feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should normalize lowercase hex to uppercase', () => {
      const value = 'https://example.com/path%2fencoded'
      const expected = 'example.com/path%2Fencoded'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should keep unsafe characters encoded', () => {
      const value = 'https://example.com/hello%20world'
      const expected = 'example.com/hello%20world'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should preserve encoding when normalizeEncoding is false', () => {
      const value = 'https://example.com/path%2Dto%2Dfeed'
      const options = { ...defaultNormalizeOptions, normalizeEncoding: false }
      const expected = 'example.com/path%2Dto%2Dfeed'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('unicode normalization', () => {
    it('should normalize unicode in hostname by default', () => {
      const value = 'https://caf\u00e9.com/feed'
      const expected = 'xn--caf-dma.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should normalize unicode in pathname by default', () => {
      const value = 'https://example.com/caf\u00e9'
      const expected = 'example.com/caf%C3%A9'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should skip unicode normalization when normalizeUnicode is false', () => {
      const value = 'https://example.com/caf\u00e9'
      const options = { ...defaultNormalizeOptions, normalizeUnicode: false }
      const expected = 'example.com/caf%C3%A9'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('punycode normalization', () => {
    it('should convert IDN to punycode by default', () => {
      const value = 'https://münchen.example.com/feed'
      const expected = 'xn--mnchen-3ya.example.com/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('case normalization', () => {
    it('should lowercase hostname by default', () => {
      const value = 'https://EXAMPLE.COM/Feed'
      const expected = 'example.com/Feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should not lowercase pathname', () => {
      const value = 'https://example.com/UPPERCASE/Path'
      const expected = 'example.com/UPPERCASE/Path'

      expect(normalizeUrl(value)).toBe(expected)
    })
  })

  describe('combined normalizations', () => {
    it('should apply all default normalizations', () => {
      const value =
        'https://user:pass@www.EXAMPLE.COM:443/path//to/feed/?utm_source=test&z=2&a=1#section'
      const expected = 'user:pass@example.com/path/to/feed?a=1&z=2'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should apply minimal normalizations when all options are false', () => {
      const value = 'https://www.example.com:8080/feed/'
      const options: NormalizeOptions = {
        stripProtocol: false,
        stripAuthentication: false,
        stripWww: false,
        stripTrailingSlash: false,
        stripRootSlash: false,
        collapseSlashes: false,
        stripHash: false,
        sortQueryParams: false,
        stripQueryParams: [],
        stripEmptyQuery: false,
        normalizeUnicode: false,
      }
      const expected = 'https://www.example.com:8080/feed/'

      expect(normalizeUrl(value, options)).toBe(expected)
    })
  })

  describe('edge cases', () => {
    it('should handle URL without path', () => {
      const value = 'https://example.com'
      const expected = 'example.com'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle URL with only query', () => {
      const value = 'https://example.com?query=value'
      const expected = 'example.com/?query=value'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle IPv4 address hosts', () => {
      const value = 'https://192.168.1.1/feed'
      const expected = '192.168.1.1/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle IPv6 address hosts', () => {
      const value = 'https://[::1]/feed'
      const expected = '[::1]/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle special characters in query values', () => {
      const value = 'https://example.com/feed?q=hello+world&tag=%23test'
      const expected = 'example.com/feed?q=hello+world&tag=%23test'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle multiple query params with same key', () => {
      const value = 'https://example.com/feed?a=1&a=2&a=3'
      const expected = 'example.com/feed?a=1&a=2&a=3'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle query param with no value', () => {
      const value = 'https://example.com/feed?key'
      const expected = 'example.com/feed?key='

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle query param with empty value', () => {
      const value = 'https://example.com/feed?key='
      const expected = 'example.com/feed?key='

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle IDN with www prefix', () => {
      const value = 'https://www.münchen.de/feed'
      const expected = 'xn--mnchen-3ya.de/feed'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle hash with special characters', () => {
      const value = 'https://example.com/feed#section/sub?param=1'
      const options = { ...defaultNormalizeOptions, stripHash: false }
      const expected = 'example.com/feed#section/sub?param=1'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should handle URL with only hash', () => {
      const value = 'https://example.com/#section'
      const expected = 'example.com'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should handle combining www strip with IDN', () => {
      const value = 'https://www.例え.jp/feed'
      const expected = 'xn--r8jz45g.jp/feed'

      expect(normalizeUrl(value)).toBe(expected)
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

      expect(normalizeUrl(value)).toBe(value)
    })

    it('should return original string for empty string', () => {
      const value = ''

      expect(normalizeUrl(value)).toBe(value)
    })

    it('should return original string for relative path', () => {
      const value = '/path/to/feed'

      expect(normalizeUrl(value)).toBe(value)
    })

    it('should handle malformed URLs gracefully', () => {
      const value = 'https://example.com:not-a-port/feed'

      expect(normalizeUrl(value)).toBe(value)
    })
  })
})

describe('applyRewrites', () => {
  const createRewrite = (matchHostname: string, newHostname: string): Rewrite => {
    return {
      match: (url) => {
        return url.hostname === matchHostname
      },
      rewrite: (url) => {
        const rewritten = new URL(url.href)
        rewritten.hostname = newHostname
        return rewritten
      },
    }
  }

  it('should apply matching rewrite', () => {
    const value = 'https://old.example.com/feed'
    const rewrites = [createRewrite('old.example.com', 'new.example.com')]
    const result = applyRewrites(value, rewrites)
    const expected = 'https://new.example.com/feed'

    expect(result).toBe(expected)
  })

  it('should apply first matching rewrite when multiple match', () => {
    const value = 'https://multi.example.com/feed'
    const rewrites = [
      createRewrite('multi.example.com', 'first.example.com'),
      createRewrite('multi.example.com', 'second.example.com'),
    ]
    const result = applyRewrites(value, rewrites)
    const expected = 'https://first.example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original URL when no rewrite matches', () => {
    const value = 'https://example.com/feed'
    const rewrites = [createRewrite('other.example.com', 'new.example.com')]
    const result = applyRewrites(value, rewrites)
    const expected = 'https://example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original URL when rewrites array is empty', () => {
    const value = 'https://example.com/feed'
    const rewrites: Array<Rewrite> = []
    const result = applyRewrites(value, rewrites)
    const expected = 'https://example.com/feed'

    expect(result).toBe(expected)
  })

  it('should return original string for invalid URL', () => {
    const value = 'not a valid url'
    const rewrites = [createRewrite('example.com', 'new.example.com')]
    const result = applyRewrites(value, rewrites)
    const expected = 'not a valid url'

    expect(result).toBe(expected)
  })
})
