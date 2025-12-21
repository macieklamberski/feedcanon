import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import type { FetchFnResponse, NormalizeOptions, PlatformHandler } from './types.js'
import {
	addMissingProtocol,
	applyPlatformHandlers,
	createMd5Hash,
	defaultFetchFn,
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
	})
})

describe('resolveUrl', () => {
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
	describe('entity decoding', () => {
		it('should decode &amp; to & by default', () => {
			const value = 'https://example.com/feed?a=1&amp;b=2'
			const expected = 'example.com/feed?a=1&b=2'

			expect(normalizeUrl(value)).toBe(expected)
		})

		it('should decode numeric entities', () => {
			const value = 'https://example.com/feed&#x3F;query=1'
			const expected = 'example.com/feed?query=1'

			expect(normalizeUrl(value)).toBe(expected)
		})

		it('should decode named entities', () => {
			const value = 'https://example.com/feed?q=a&lt;b'
			const expected = 'example.com/feed?q=a%3Cb'

			expect(normalizeUrl(value)).toBe(expected)
		})

		it('should decode entities by default', () => {
			const value = 'https://example.com/path&amp;name/feed'
			const expected = 'example.com/path&name/feed'

			expect(normalizeUrl(value)).toBe(expected)
		})

		it('should decode entities when decodeEntities is true', () => {
			const value = 'https://example.com/path&amp;name/feed'
			const options = { ...defaultNormalizeOptions, decodeEntities: true }
			const expected = 'example.com/path&name/feed'

			expect(normalizeUrl(value, options)).toBe(expected)
		})

		it('should preserve entities when decodeEntities is false', () => {
			const value = 'https://example.com/path&amp;name/feed'
			const options = { ...defaultNormalizeOptions, decodeEntities: false }
			const expected = 'example.com/path&amp;name/feed'

			expect(normalizeUrl(value, options)).toBe(expected)
		})

		it('should handle multiple encoded ampersands', () => {
			const value = 'https://example.com/feed?a=1&amp;b=2&amp;c=3'
			const expected = 'example.com/feed?a=1&b=2&c=3'

			expect(normalizeUrl(value)).toBe(expected)
		})
	})

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
		it('should keep root slash', () => {
			const value = 'https://example.com/'
			const expected = 'example.com/'

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

	describe('text fragment stripping', () => {
		it('should strip text fragments by default when stripHash is false', () => {
			const value = 'https://example.com/feed#:~:text=hello'
			const options = { ...defaultNormalizeOptions, stripHash: false }
			const expected = 'example.com/feed'

			expect(normalizeUrl(value, options)).toBe(expected)
		})

		it('should preserve text fragments when stripTextFragment is false', () => {
			const value = 'https://example.com/feed#:~:text=hello'
			const options = { ...defaultNormalizeOptions, stripHash: false, stripTextFragment: false }
			const expected = 'example.com/feed#:~:text=hello'

			expect(normalizeUrl(value, options)).toBe(expected)
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
	})

	describe('empty query removal', () => {
		it('should remove empty query string by default', () => {
			const value = 'https://example.com/feed?'
			const expected = 'example.com/feed'

			expect(normalizeUrl(value)).toBe(expected)
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
			const expected = 'https://www.example.com:8080/feed/'

			expect(normalizeUrl(value, options)).toBe(expected)
		})
	})

	describe('edge cases', () => {
		it('should handle URL without path', () => {
			const value = 'https://example.com'
			const expected = 'example.com/'

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
			const expected = 'example.com/'

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

describe('createMd5Hash', () => {
	it('should return MD5 hash of content', () => {
		const value = 'hello world'
		const expected = '5eb63bbbe01eeed093cb22bb8f5acdc3'

		expect(createMd5Hash(value)).toBe(expected)
	})

	it('should return different hashes for different content', () => {
		const value1 = 'content1'
		const value2 = 'content2'

		expect(createMd5Hash(value1)).not.toBe(createMd5Hash(value2))
	})

	it('should return same hash for identical content', () => {
		const value = 'same content'

		expect(createMd5Hash(value)).toBe(createMd5Hash(value))
	})
})
