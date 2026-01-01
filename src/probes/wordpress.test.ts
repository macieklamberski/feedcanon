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
  })

  describe('getCandidates', () => {
    it('should return /feed/atom path for feed=atom', () => {
      const value = new URL('https://example.com/?feed=atom')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/feed/atom')
    })

    it('should return /feed path for feed=rss2', () => {
      const value = new URL('https://example.com/?feed=rss2')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/feed')
    })

    it('should return /feed path for feed=rss', () => {
      const value = new URL('https://example.com/?feed=rss')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/feed')
    })

    it('should return /feed path for feed=rdf', () => {
      const value = new URL('https://example.com/?feed=rdf')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/feed')
    })

    it('should preserve existing path', () => {
      const value = new URL('https://example.com/blog/category/?feed=atom')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/blog/category/feed/atom')
    })

    it('should remove trailing slash from base path before appending', () => {
      const value = new URL('https://example.com/blog/?feed=rss2')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/blog/feed')
    })

    it('should preserve other query params', () => {
      const value = new URL('https://example.com/?feed=atom&other=param')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates[0].href).toBe('https://example.com/feed/atom?other=param')
    })

    it('should return both variants without double slashes', () => {
      const value = new URL('https://example.com/blog/?feed=rss2')
      const candidates = wordpressProbe.getCandidates(value)
      const expected = ['https://example.com/blog/feed', 'https://example.com/blog/feed/']

      expect(candidates.map((c) => c.href)).toEqual(expected)
    })

    it('should return empty array when feed param is missing', () => {
      const value = new URL('https://example.com/feed')
      const candidates = wordpressProbe.getCandidates(value)

      expect(candidates).toEqual([])
    })
  })
})
