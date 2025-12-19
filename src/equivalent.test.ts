import { describe, expect, it } from 'bun:test'
import { defaultNormalizeOptions } from './defaults.js'
import { areEquivalent } from './equivalent.js'

describe('areEquivalent', () => {
  describe('Normalize method', () => {
    it('should detect equivalent URLs via normalization', async () => {
      const url1 = 'https://example.com/feed'
      const url2 = 'https://www.example.com/feed/'
      const options = { methods: { normalize: defaultNormalizeOptions } }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: true, method: 'normalize' }

      expect(result).toEqual(expected)
    })

    it('should return false for non-equivalent URLs', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      const options = {
        methods: { normalize: defaultNormalizeOptions, redirects: false, responseHash: false },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })
  })

  describe('Redirects method', () => {
    it('should detect equivalent URLs via redirect to same final URL', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      const options = {
        methods: { redirects: true, responseHash: false },
        fetchFn: async () => {
          return {
            status: 200,
            url: 'https://example.com/canonical',
            body: 'content',
            headers: new Headers(),
          }
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: true, method: 'redirects' }

      expect(result).toEqual(expected)
    })

    it('should detect equivalent when one redirects to the other', async () => {
      const url1 = 'https://old.example.com/feed'
      const url2 = 'https://new.example.com/feed'
      const options = {
        methods: { redirects: true, responseHash: false },
        fetchFn: async (url: string) => {
          if (url === url1) {
            return {
              status: 200,
              url: url2,
              body: 'content',
              headers: new Headers(),
            }
          }

          return {
            status: 200,
            url: url2,
            body: 'content',
            headers: new Headers(),
          }
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: true, method: 'redirects' }

      expect(result).toEqual(expected)
    })
  })

  describe('Response hash method', () => {
    it('should detect equivalent URLs via content hash', async () => {
      const url1 = 'https://cdn.example.com/feed'
      const url2 = 'https://example.com/feed'
      const options = {
        methods: { redirects: false, responseHash: true },
        fetchFn: async () => {
          return {
            status: 200,
            url: 'different',
            body: 'same content',
            headers: new Headers(),
          }
        },
        hashFn: () => {
          return 'same-hash'
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: true, method: 'response_hash' }

      expect(result).toEqual(expected)
    })

    it('should return false for different content hashes', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      let callCount = 0
      let hashCallCount = 0
      const options = {
        methods: { redirects: false, responseHash: true },
        fetchFn: async () => {
          callCount++
          return {
            status: 200,
            url: `url${callCount}`,
            body: `content${callCount}`,
            headers: new Headers(),
          }
        },
        hashFn: () => {
          hashCallCount++
          return `hash${hashCallCount}`
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })
  })

  describe('Feed data hash method', () => {
    it('should not match when feedDataHash method is enabled but not implemented', async () => {
      const url1 = 'https://cdn.example.com/feed'
      const url2 = 'https://example.com/feed'
      const options = {
        methods: { redirects: false, responseHash: false, feedDataHash: true },
        fetchFn: async () => {
          return {
            status: 200,
            url: 'different',
            body: '<feed>content</feed>',
            headers: new Headers(),
          }
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })
  })

  describe('Verification', () => {
    it('should return false when verification fails', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      const options = {
        methods: {},
        verifyUrlFn: () => {
          return false
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })
  })

  describe('Fetch errors', () => {
    it('should return false when fetch fails', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      const options = {
        methods: {},
        fetchFn: async () => {
          throw new Error('Network error')
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })

    it('should return false when fetch returns not ok', async () => {
      const url1 = 'https://example.com/feed1'
      const url2 = 'https://example.com/feed2'
      const options = {
        methods: {},
        fetchFn: async () => {
          return {
            status: 404,
            url: '',
            body: '',
            headers: new Headers(),
          }
        },
      }
      const result = await areEquivalent(url1, url2, options)
      const expected = { equivalent: false }

      expect(result).toEqual(expected)
    })
  })
})
