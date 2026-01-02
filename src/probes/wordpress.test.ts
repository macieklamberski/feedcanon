import { describe, expect, it } from 'bun:test'
import { wordpressProbe } from './wordpress.js'

describe('wordpressProbe', () => {
  describe('match', () => {
    it('should match URL with feed=atom query param', () => {
      const value = new URL('https://example.com/blog/?feed=atom')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should match URL with feed=rss query param', () => {
      const value = new URL('https://example.com/?feed=rss')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should match URL with feed=rss2 query param', () => {
      const value = new URL('https://example.com/?feed=rss2')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should match URL with feed=rdf query param', () => {
      const value = new URL('https://example.com/?feed=rdf')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should match case-insensitively', () => {
      const value = new URL('https://example.com/?feed=ATOM')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should not match URL without feed query param', () => {
      const value = new URL('https://example.com/feed')

      expect(wordpressProbe.match(value)).toBe(false)
    })

    it('should not match URL with unknown feed value', () => {
      const value = new URL('https://example.com/?feed=json')

      expect(wordpressProbe.match(value)).toBe(false)
    })

    it('should not match URL with empty feed value', () => {
      const value = new URL('https://example.com/?feed=')

      expect(wordpressProbe.match(value)).toBe(false)
    })

    it('should match URL with feed=comments-rss2 query param', () => {
      const value = new URL('https://example.com/?feed=comments-rss2')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should match URL with feed=comments-atom query param', () => {
      const value = new URL('https://example.com/?feed=comments-atom')

      expect(wordpressProbe.match(value)).toBe(true)
    })

    it('should not match URL with unknown comments feed value', () => {
      const value = new URL('https://example.com/?feed=comments-json')

      expect(wordpressProbe.match(value)).toBe(false)
    })
  })

  describe('getCandidates', () => {
    it('should return /feed/atom path for feed=atom', () => {
      const value = new URL('https://example.com/?feed=atom')
      const expected = ['https://example.com/feed/atom', 'https://example.com/feed/atom/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return /feed path for feed=rss2', () => {
      const value = new URL('https://example.com/?feed=rss2')
      const expected = ['https://example.com/feed', 'https://example.com/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return /feed path for feed=rss', () => {
      const value = new URL('https://example.com/?feed=rss')
      const expected = ['https://example.com/feed', 'https://example.com/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return /feed path for feed=rdf', () => {
      const value = new URL('https://example.com/?feed=rdf')
      const expected = ['https://example.com/feed', 'https://example.com/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should preserve existing path', () => {
      const value = new URL('https://example.com/blog/category/?feed=atom')
      const expected = [
        'https://example.com/blog/category/feed/atom',
        'https://example.com/blog/category/feed/atom/',
      ]

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should remove trailing slash from base path before appending', () => {
      const value = new URL('https://example.com/blog/?feed=rss2')
      const expected = ['https://example.com/blog/feed', 'https://example.com/blog/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should preserve other query params', () => {
      const value = new URL('https://example.com/?feed=atom&other=param')
      const expected = [
        'https://example.com/feed/atom?other=param',
        'https://example.com/feed/atom/?other=param',
      ]

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return empty array when feed param is missing', () => {
      const value = new URL('https://example.com/feed')

      expect(wordpressProbe.getCandidates(value)).toEqual([])
    })

    it('should strip param when path already ends with /feed/', () => {
      const value = new URL('https://example.com/blog/feed/?feed=rss2')
      const expected = ['https://example.com/blog/feed', 'https://example.com/blog/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should strip param when path already ends with /feed', () => {
      const value = new URL('https://example.com/blog/feed?feed=rss2')
      const expected = ['https://example.com/blog/feed', 'https://example.com/blog/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should strip param when path contains /feed/atom', () => {
      const value = new URL('https://example.com/feed/atom/?feed=atom')
      const expected = ['https://example.com/feed/atom', 'https://example.com/feed/atom/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should not strip param for path containing feed as substring', () => {
      const value = new URL('https://example.com/feedback/?feed=rss2')
      const expected = ['https://example.com/feedback/feed', 'https://example.com/feedback/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return /comments/feed path for feed=comments-rss2', () => {
      const value = new URL('https://example.com/?feed=comments-rss2')
      const expected = ['https://example.com/comments/feed', 'https://example.com/comments/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should return /comments/feed/atom path for feed=comments-atom', () => {
      const value = new URL('https://example.com/?feed=comments-atom')
      const expected = [
        'https://example.com/comments/feed/atom',
        'https://example.com/comments/feed/atom/',
      ]

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should preserve existing path for comment feeds', () => {
      const value = new URL('https://example.com/blog/?feed=comments-rss2')
      const expected = [
        'https://example.com/blog/comments/feed',
        'https://example.com/blog/comments/feed/',
      ]

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should strip param when path already has /comments/feed/', () => {
      const value = new URL('https://example.com/comments/feed/?feed=comments-rss2')
      const expected = ['https://example.com/comments/feed', 'https://example.com/comments/feed/']

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })

    it('should strip param when path already has /blog/comments/feed', () => {
      const value = new URL('https://example.com/blog/comments/feed?feed=comments-atom')
      const expected = [
        'https://example.com/blog/comments/feed',
        'https://example.com/blog/comments/feed/',
      ]

      expect(wordpressProbe.getCandidates(value)).toEqual(expected)
    })
  })
})
