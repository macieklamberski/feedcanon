import { describe, expect, it } from 'bun:test'
import { mediumRewrite } from './medium.js'

describe('mediumRewrite', () => {
  describe('match', () => {
    it('should match medium.com', () => {
      const value = new URL('https://medium.com/@alice/feed')

      expect(mediumRewrite.match(value)).toBe(true)
    })

    it('should match www.medium.com', () => {
      const value = new URL('https://www.medium.com/feed/@alice')

      expect(mediumRewrite.match(value)).toBe(true)
    })

    it('should not match a publication on its own Medium subdomain', () => {
      const value = new URL('https://example-press.medium.com/feed')

      expect(mediumRewrite.match(value)).toBe(false)
    })

    it('should not match other domains', () => {
      const value = new URL('https://example.com/@alice/feed')

      expect(mediumRewrite.match(value)).toBe(false)
    })
  })

  describe('rewrite', () => {
    it('should rewrite a user feed with the feed segment first', () => {
      const value = new URL('https://medium.com/feed/@alice')
      const expected = 'https://medium.com/@alice/feed'

      expect(mediumRewrite.rewrite(value).href).toBe(expected)
    })

    it('should rewrite a user feed on the www host over http', () => {
      const value = new URL('http://www.medium.com/feed/@alice')
      const expected = 'https://medium.com/@alice/feed'

      expect(mediumRewrite.rewrite(value).href).toBe(expected)
    })

    it('should keep a user feed in its main spelling', () => {
      const value = new URL('https://medium.com/@alice/feed')
      const expected = 'https://medium.com/@alice/feed'

      expect(mediumRewrite.rewrite(value).href).toBe(expected)
    })

    it('should keep a profile page', () => {
      const value = new URL('https://medium.com/@alice')
      const expected = 'https://medium.com/@alice'

      expect(mediumRewrite.rewrite(value).href).toBe(expected)
    })
  })
})
