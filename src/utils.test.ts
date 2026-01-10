import { describe, expect, it } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import type { NormalizeOptions, Probe, Rewrite } from './types.js'
import {
  addMissingProtocol,
  applyProbes,
  applyRewrites,
  createSignature,
  fixMalformedProtocol,
  neutralizeUrls,
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

  describe('query lowercasing', () => {
    it('should not lowercase query by default', () => {
      const value = 'https://example.com/feed?Format=RSS'
      const expected = 'example.com/feed?Format=RSS'

      expect(normalizeUrl(value)).toBe(expected)
    })

    it('should lowercase query param names when lowercaseQuery is true', () => {
      const value = 'https://example.com/feed?Format=rss'
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true }
      const expected = 'example.com/feed?format=rss'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should lowercase query param values when lowercaseQuery is true', () => {
      const value = 'https://example.com/feed?format=RSS'
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true }
      const expected = 'example.com/feed?format=rss'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should lowercase both names and values when lowercaseQuery is true', () => {
      const value = 'https://example.com/feed?Format=RSS'
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true }
      const expected = 'example.com/feed?format=rss'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should handle multiple query params', () => {
      const value = 'https://example.com/feed?A=X&B=Y'
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true }
      const expected = 'example.com/feed?a=x&b=y'

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should handle empty query value', () => {
      const value = 'https://example.com/feed?Key='
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true }
      const expected = 'example.com/feed?key='

      expect(normalizeUrl(value, options)).toBe(expected)
    })

    it('should work with sortQueryParams', () => {
      const value = 'https://example.com/feed?Z=1&A=2'
      const options = { ...defaultNormalizeOptions, lowercaseQuery: true, sortQueryParams: true }
      const expected = 'example.com/feed?a=2&z=1'

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

describe('applyProbes', () => {
  const createProbe = (matchQuery: string, candidatePath: string): Probe => {
    return {
      match: (url) => {
        return url.searchParams.has(matchQuery)
      },
      getCandidates: (url) => {
        const candidate = new URL(url.href)
        candidate.pathname = candidatePath
        candidate.searchParams.delete(matchQuery)
        return [candidate.href]
      },
    }
  }

  it('should return first working candidate', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = async (url: string) => {
      if (url === 'https://example.com/feed') {
        return url
      }
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original URL when no candidate works', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = async () => {
      return undefined
    }
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original URL when no probe matches', async () => {
    const value = 'https://example.com/feed'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = async () => {
      throw new Error('Should not be called')
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original URL when probes array is empty', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes: Array<Probe> = []
    const testCandidate = async () => {
      throw new Error('Should not be called')
    }
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original string for invalid URL', async () => {
    const value = 'not a valid url'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = async () => {
      throw new Error('Should not be called')
    }
    const expected = 'not a valid url'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should try candidates in order and use first working one', async () => {
    const value = 'https://example.com/?feed=atom'
    const probes: Array<Probe> = [
      {
        match: (url) => url.searchParams.has('feed'),
        getCandidates: (url) => {
          const first = new URL(url.href)
          first.pathname = '/feed/atom'
          first.searchParams.delete('feed')

          const second = new URL(url.href)
          second.pathname = '/feed'
          second.searchParams.delete('feed')

          return [first.href, second.href]
        },
      },
    ]
    const testCandidate = async (url: string) => {
      if (url === 'https://example.com/feed') {
        return url
      }
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should only try first matching probe', async () => {
    const value = 'https://example.com/?feed=rss2'
    let secondProbeCalled = false
    const probes: Array<Probe> = [
      {
        match: (url) => url.searchParams.has('feed'),
        getCandidates: () => [],
      },
      {
        match: (url) => url.searchParams.has('feed'),
        getCandidates: () => {
          secondProbeCalled = true
          return []
        },
      },
    ]
    const testCandidate = async () => undefined
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
    expect(secondProbeCalled).toBe(false)
  })
})

describe('createSignature', () => {
  it('should create JSON signature from object', () => {
    const value = { title: 'Test', link: 'https://example.com' }
    const expected = '{"title":"Test","link":"https://example.com"}'

    expect(createSignature(value, [])).toBe(expected)
  })

  it('should neutralize single field', () => {
    const value = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }
    const expected = '{"title":"Test","link":"https://example.com"}'

    expect(createSignature(value, ['generator'])).toBe(expected)
  })

  it('should neutralize multiple fields', () => {
    const value = {
      title: 'Test',
      link: 'https://example.com',
      generator: 'WordPress',
      pubDate: '2024-01-01',
    }
    const expected = '{"title":"Test","link":"https://example.com"}'

    expect(createSignature(value, ['generator', 'pubDate'])).toBe(expected)
  })

  it('should restore original values after creating signature', () => {
    const value = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }
    createSignature(value, ['generator'])

    expect(value.generator).toBe('WordPress')
    expect(value.title).toBe('Test')
    expect(value.link).toBe('https://example.com')
  })

  it('should handle nested objects', () => {
    const value = { title: 'Test', meta: { author: 'John', date: '2024-01-01' } }
    const expected = '{"title":"Test"}'

    expect(createSignature(value, ['meta'])).toBe(expected)
    expect(value.meta).toEqual({ author: 'John', date: '2024-01-01' })
  })

  it('should handle arrays', () => {
    const value = { title: 'Test', items: [1, 2, 3] }
    const expected = '{"title":"Test"}'

    expect(createSignature(value, ['items'])).toBe(expected)
    expect(value.items).toEqual([1, 2, 3])
  })

  it('should handle undefined fields', () => {
    const value: Record<string, unknown> = { title: 'Test', link: undefined }
    const expected = '{"title":"Test"}'

    expect(createSignature(value, ['link'])).toBe(expected)
    expect(value.link).toBeUndefined()
  })

  it('should handle empty fields array', () => {
    const value = { title: 'Test', link: 'https://example.com' }
    const expected = '{"title":"Test","link":"https://example.com"}'

    expect(createSignature(value, [])).toBe(expected)
  })
})

describe('neutralizeUrls', () => {
  describe('same-domain normalization', () => {
    it('should normalize https same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize http same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"http://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize www same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://www.example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL when feed URL has www', () => {
      const url = 'https://www.example.com/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle multiple same-domain URLs in signature', () => {
      const url = 'https://example.com/feed'
      const value = '{"a":"https://example.com/post/1","b":"https://example.com/post/2"}'
      const expected = '{"a":"/post/1","b":"/post/2"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare https same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare http same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"http://example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare www same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://www.example.com"}'
      const expected = '{"href":"/"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URLs in query parameters', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://tracker.com/click?url=https://example.com/post"}'
      const expected = '{"link":"https://tracker.com/click?url=/post"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle mixed same-domain and external URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"internal":"https://example.com/post","external":"https://other.com/path"}'
      const expected = '{"internal":"/post","external":"https://other.com/path"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle feed from subdomain normalizing its own URLs', () => {
      const url = 'https://blog.example.com/feed'
      const value = '{"link":"https://blog.example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize parent domain URLs when feed is on subdomain', () => {
      const url = 'https://blog.example.com/feed'
      const value = '{"link":"https://example.com/main"}'
      const expected = '{"link":"https://example.com/main"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com:8080/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize different port URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com:3000/post/1"}'
      const expected = '{"link":"https://example.com:3000/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize portless URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"https://example.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle same-domain URLs in JSON arrays', () => {
      const url = 'https://example.com/feed'
      const value = '["https://example.com/a","https://example.com/b"]'
      const expected = '["/a","/b"]'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve path case when normalizing domain', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/Path/To/Page"}'
      const expected = '{"link":"/Path/To/Page"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('trailing slash normalization', () => {
    it('should strip trailing slash from https URL before quote', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/"}'
      const expected = '{"link":"https://external.com/path"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from root-relative path before quote', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/path/"}'
      const expected = '{"link":"/path"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve root "/" path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/"}'
      const expected = '{"link":"/"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from deep path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/a/b/c/d/"}'
      const expected = '{"link":"/a/b/c/d"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query from https URL', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/?page=2"}'
      const expected = '{"link":"https://external.com/path?page=2"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query from root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/path/?page=2"}'
      const expected = '{"link":"/path?page=2"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle query string with multiple parameters', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"/feed/json/?paged=2&format=json"}'
      const expected = '{"link":"/feed/json?paged=2&format=json"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL and strip trailing slash', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com/post/1/"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL with query and strip trailing slash', () => {
      const url = 'https://example.com/rss'
      const value = '{"link":"https://example.com/feed/?page=2"}'
      const expected = '{"link":"/feed?page=2"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not strip trailing slash before fragment', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/#section"}'
      const expected = '{"link":"https://external.com/path/#section"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query even with fragment', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path/?page=1#section"}'
      const expected = '{"link":"https://external.com/path?page=1#section"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should only strip last trailing slash (multiple slashes)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/path//"}'
      const expected = '{"link":"https://external.com/path/"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from http URL', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"http://external.com/path/"}'
      const expected = '{"link":"http://external.com/path"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('security edge cases', () => {
    it('should not match domain suffix attack (example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com.evil.com/post/1"}'
      const expected = '{"link":"https://example.com.evil.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize URLs with ports', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example.com:8080/post/1"}'
      const expected = '{"link":"https://example.com:8080/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match subdomains of feed domain', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://api.example.com/post/1"}'
      const expected = '{"link":"https://api.example.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match similar domain with different prefix (notexample.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://notexample.com/post/1"}'
      const expected = '{"link":"https://notexample.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle domain with hyphen correctly', () => {
      const url = 'https://my-example.com/feed'
      const value = '{"link":"https://my-example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match partial domain (example vs example.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://example/post/1"}'
      const expected = '{"link":"https://example/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match www variant of suffix attack (www.example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://www.example.com.evil.com/post/1"}'
      const expected = '{"link":"https://www.example.com.evil.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('preservation cases', () => {
    it('should preserve external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://external.com/post/1"}'
      const expected = '{"link":"https://external.com/post/1"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve bare external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"href":"https://external.com"}'
      const expected = '{"href":"https://external.com"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve URLs embedded in text (not standalone JSON values)', () => {
      const url = 'https://example.com/feed'
      const value = '{"description":"Visit https://example.com for more"}'
      const expected = '{"description":"Visit https://example.com for more"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve bare domain followed by space in text', () => {
      const url = 'https://example.com/feed'
      const value = '{"text":"Check https://example.com now"}'
      const expected = '{"text":"Check https://example.com now"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve URLs with authentication', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://user:pass@example.com/path"}'
      const expected = '{"link":"https://user:pass@example.com/path"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('error handling', () => {
    it('should return original signature for invalid URL', () => {
      const url = 'not-a-valid-url'
      const value = '{"title":"Test"}'
      const expected = '{"title":"Test"}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle empty signature', () => {
      const url = 'https://example.com/feed'
      const value = ''
      const expected = ''

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle signature with no URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"title":"Hello","count":42}'
      const expected = '{"title":"Hello","count":42}'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('multiple URLs', () => {
    it('should normalize URLs from multiple hosts', () => {
      const urls = ['https://example.com/feed', 'https://cdn.example.org/assets']
      const value = '{"a":"https://example.com/post","b":"https://cdn.example.org/img"}'
      const expected = '{"a":"/post","b":"/img"}'

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should normalize URLs when one host is content host and one is feed host', () => {
      const urls = ['https://feeds.feedburner.com/Example', 'https://example.com']
      const value = '{"link":"https://example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should handle empty urls array', () => {
      const value = '{"link":"https://example.com/post"}'
      const expected = '{"link":"https://example.com/post"}'

      expect(neutralizeUrls(value, [])).toBe(expected)
    })
  })

  describe('potential normalizations (not yet implemented)', () => {
    it('should normalize protocol-relative URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"//example.com/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).not.toBe(expected)
    })

    it('should normalize uppercase protocol URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"HTTPS://EXAMPLE.COM/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).not.toBe(expected)
    })

    it('should normalize uppercase domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = '{"link":"https://EXAMPLE.COM/post/1"}'
      const expected = '{"link":"/post/1"}'

      expect(neutralizeUrls(value, [url])).not.toBe(expected)
    })
  })

  describe('JSON-escaped quotes in HTML content', () => {
    it('should normalize URLs followed by escaped quotes in JSON', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ description: '<a href="https://example.com">link</a>' })
      const expected = JSON.stringify({ description: '<a href="/">link</a>' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize URLs with path followed by escaped quotes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ description: '<a href="https://example.com/post/1">link</a>' })
      const expected = JSON.stringify({ description: '<a href="/post/1">link</a>' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize http URLs followed by escaped quotes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ description: '<a href="http://example.com/post">link</a>' })
      const expected = JSON.stringify({ description: '<a href="/post">link</a>' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize www URLs followed by escaped quotes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: '<a href="https://www.example.com/post">link</a>',
      })
      const expected = JSON.stringify({ description: '<a href="/post">link</a>' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize multiple URLs with escaped quotes in same content', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description:
          '<a href="https://example.com/a">A</a> and <a href="https://example.com/b">B</a>',
      })
      const expected = JSON.stringify({
        description: '<a href="/a">A</a> and <a href="/b">B</a>',
      })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle mixed regular and escaped quotes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        link: 'https://example.com/post',
        description: '<a href="https://example.com/other">',
      })
      const expected = JSON.stringify({
        link: '/post',
        description: '<a href="/other">',
      })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })
})
