import { describe, expect, it } from 'bun:test'
import type { Probe, Rewrite } from './types.js'
import { applyProbes, applyRewrites, createSignature, neutralizeUrls } from './utils.js'

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
    const expected = 'https://new.example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should apply first matching rewrite when multiple match', () => {
    const value = 'https://multi.example.com/feed'
    const rewrites = [
      createRewrite('multi.example.com', 'first.example.com'),
      createRewrite('multi.example.com', 'second.example.com'),
    ]
    const expected = 'https://first.example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should return original URL when no rewrite matches', () => {
    const value = 'https://example.com/feed'
    const rewrites = [createRewrite('other.example.com', 'new.example.com')]
    const expected = 'https://example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should return original URL when rewrites array is empty', () => {
    const value = 'https://example.com/feed'
    const rewrites: Array<Rewrite> = []
    const expected = 'https://example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should return original string for invalid URL', () => {
    const value = 'not a valid url'
    const rewrites = [createRewrite('example.com', 'new.example.com')]
    const expected = 'not a valid url'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should return original URL when match() throws', () => {
    const value = 'https://example.com/feed'
    const rewrites: Array<Rewrite> = [
      {
        match: () => {
          throw new Error('Match failed')
        },
        rewrite: (url) => url,
      },
    ]
    const expected = 'https://example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
  })

  it('should return original URL when rewrite() throws', () => {
    const value = 'https://example.com/feed'
    const rewrites: Array<Rewrite> = [
      {
        match: () => true,
        rewrite: () => {
          throw new Error('Rewrite failed')
        },
      },
    ]
    const expected = 'https://example.com/feed'

    expect(applyRewrites(value, rewrites)).toBe(expected)
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
    const testCandidate = (url: string) => {
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
    const testCandidate = () => undefined
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original URL when no probe matches', async () => {
    const value = 'https://example.com/feed'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => {
      throw new Error('Should not be called')
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original URL when probes array is empty', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes: Array<Probe> = []
    const testCandidate = () => {
      throw new Error('Should not be called')
    }
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return original string for invalid URL', async () => {
    const value = 'not a valid url'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => {
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
    const testCandidate = (url: string) => {
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
    const testCandidate = () => undefined
    const expected = 'https://example.com/?feed=rss2'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
    expect(secondProbeCalled).toBe(false)
  })

  it('should propagate testCandidate errors', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => {
      throw new Error('Callback failed')
    }

    await expect(applyProbes(value, probes, testCandidate)).rejects.toThrow('Callback failed')
  })

  it('should try second probe when first does not match', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes: Array<Probe> = [
      {
        match: (url) => url.searchParams.has('format'),
        getCandidates: () => {
          throw new Error('Should not be called')
        },
      },
      createProbe('feed', '/feed'),
    ]
    const testCandidate = (url: string) => {
      if (url === 'https://example.com/feed') {
        return url
      }
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it.todo('should await async testCandidate results', () => {
    // testCandidate returns a Promise that resolves to the candidate URL after a delay.
    // Expected: applyProbes awaits it and returns the resolved candidate.
  })

  it.todo('should return original URL when getCandidates throws', () => {
    // Probe matches but getCandidates throws. Expected: the surrounding try/catch returns
    // the original URL instead of propagating the error.
  })
})

describe('createSignature', () => {
  it('should create JSON signature from object', () => {
    const value = { title: 'Test', link: 'https://example.com' }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(createSignature(value, [])).toBe(expected)
  })

  it('should neutralize single field', () => {
    const value = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(createSignature(value, ['generator'])).toBe(expected)
  })

  it('should neutralize multiple fields', () => {
    const value = {
      title: 'Test',
      link: 'https://example.com',
      generator: 'WordPress',
      pubDate: '2024-01-01',
    }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(createSignature(value, ['generator', 'pubDate'])).toBe(expected)
  })

  it('should restore original values after creating signature', () => {
    const value = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }
    const expected = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }

    createSignature(value, ['generator'])

    expect(value).toEqual(expected)
  })

  it('should handle nested objects', () => {
    const value = { title: 'Test', meta: { author: 'John', date: '2024-01-01' } }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, ['meta'])).toBe(expected)
  })

  it('should handle arrays', () => {
    const value = { title: 'Test', items: [1, 2, 3] }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, ['items'])).toBe(expected)
  })

  it('should handle undefined fields', () => {
    const value: Record<string, unknown> = { title: 'Test', link: undefined }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, ['link'])).toBe(expected)
  })

  it('should handle field missing from object', () => {
    const value: Record<string, unknown> = { title: 'Test' }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, ['link'])).toBe(expected)
  })

  it('should handle empty fields array', () => {
    const value = { title: 'Test', link: 'https://example.com' }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(createSignature(value, [])).toBe(expected)
  })

  it('should omit null fields from signature', () => {
    const value: Record<string, unknown> = { title: 'Test', link: null }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, ['link'])).toBe(expected)
  })

  it('should handle empty object', () => {
    const value = {}
    const expected = JSON.stringify({})

    expect(createSignature(value, [])).toBe(expected)
  })

  it('should omit only top-level fields, not same-named nested keys', () => {
    const value = {
      link: 'https://example.com/feed',
      items: [{ link: 'https://example.com/post' }],
    }
    const expected = JSON.stringify({ items: [{ link: 'https://example.com/post' }] })

    expect(createSignature(value, ['link'])).toBe(expected)
  })

  it('should leave the object intact when serialization throws', () => {
    // BigInt is not serializable, so JSON.stringify throws. Because no field is mutated,
    // the input object is unchanged — the prior implementation left it corrupted.
    const value: Record<string, unknown> = { title: 'Test', big: 1n }
    const throwing = () => createSignature(value, ['title'])

    expect(throwing).toThrow()
    expect(value.title).toBe('Test')
    expect(value.big).toBe(1n)
  })
})

describe('neutralizeUrls', () => {
  describe('same-domain normalization', () => {
    it('should normalize https same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize http same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'http://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize www same-domain URL to root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://www.example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL when feed URL has www', () => {
      const url = 'https://www.example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle multiple same-domain URLs in signature', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        a: 'https://example.com/post/1',
        b: 'https://example.com/post/2',
      })
      const expected = JSON.stringify({ a: '/post/1', b: '/post/2' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare https same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ href: 'https://example.com' })
      const expected = JSON.stringify({ href: '/' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare http same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ href: 'http://example.com' })
      const expected = JSON.stringify({ href: '/' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize bare www same-domain to root', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ href: 'https://www.example.com' })
      const expected = JSON.stringify({ href: '/' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URLs in query parameters', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        link: 'https://tracker.com/click?url=https://example.com/post',
      })
      const expected = JSON.stringify({ link: 'https://tracker.com/click?url=/post' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle mixed same-domain and external URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        internal: 'https://example.com/post',
        external: 'https://other.com/path',
      })
      const expected = JSON.stringify({ internal: '/post', external: 'https://other.com/path' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle feed from subdomain normalizing its own URLs', () => {
      const url = 'https://blog.example.com/feed'
      const value = JSON.stringify({ link: 'https://blog.example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize parent domain URLs when feed is on subdomain', () => {
      const url = 'https://blog.example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/main' })
      const expected = JSON.stringify({ link: 'https://example.com/main' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = JSON.stringify({ link: 'https://example.com:8080/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize different port URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = JSON.stringify({ link: 'https://example.com:3000/post/1' })
      const expected = JSON.stringify({ link: 'https://example.com:3000/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize portless URLs when feed URL has port', () => {
      const url = 'https://example.com:8080/feed'
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: 'https://example.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle same-domain URLs in JSON arrays', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify(['https://example.com/a', 'https://example.com/b'])
      const expected = JSON.stringify(['/a', '/b'])

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve path case when normalizing domain', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/Path/To/Page' })
      const expected = JSON.stringify({ link: '/Path/To/Page' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('trailing slash normalization', () => {
    it('should strip trailing slash from https URL before quote', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/path/' })
      const expected = JSON.stringify({ link: 'https://external.com/path' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from root-relative path before quote', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '/path/' })
      const expected = JSON.stringify({ link: '/path' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve root "/" path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '/' })
      const expected = JSON.stringify({ link: '/' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from deep path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '/a/b/c/d/' })
      const expected = JSON.stringify({ link: '/a/b/c/d' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query from https URL', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/path/?page=2' })
      const expected = JSON.stringify({ link: 'https://external.com/path?page=2' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query from root-relative path', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '/path/?page=2' })
      const expected = JSON.stringify({ link: '/path?page=2' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle query string with multiple parameters', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '/feed/json/?paged=2&format=json' })
      const expected = JSON.stringify({ link: '/feed/json?paged=2&format=json' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL and strip trailing slash', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/post/1/' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize same-domain URL with query and strip trailing slash', () => {
      const url = 'https://example.com/rss'
      const value = JSON.stringify({ link: 'https://example.com/feed/?page=2' })
      const expected = JSON.stringify({ link: '/feed?page=2' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not strip trailing slash before fragment', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/path/#section' })
      const expected = JSON.stringify({ link: 'https://external.com/path/#section' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash before query even with fragment', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/path/?page=1#section' })
      const expected = JSON.stringify({ link: 'https://external.com/path?page=1#section' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should only strip last trailing slash (multiple slashes)', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/path//' })
      const expected = JSON.stringify({ link: 'https://external.com/path/' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should strip trailing slash from http URL', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'http://external.com/path/' })
      const expected = JSON.stringify({ link: 'http://external.com/path' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('security edge cases', () => {
    it('should not match domain suffix attack (example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com.evil.com/post/1' })
      const expected = JSON.stringify({ link: 'https://example.com.evil.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not normalize URLs with ports', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com:8080/post/1' })
      const expected = JSON.stringify({ link: 'https://example.com:8080/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match subdomains of feed domain', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://api.example.com/post/1' })
      const expected = JSON.stringify({ link: 'https://api.example.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match similar domain with different prefix (notexample.com)', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://notexample.com/post/1' })
      const expected = JSON.stringify({ link: 'https://notexample.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should handle domain with hyphen correctly', () => {
      const url = 'https://my-example.com/feed'
      const value = JSON.stringify({ link: 'https://my-example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match partial domain (example vs example.com)', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example/post/1' })
      const expected = JSON.stringify({ link: 'https://example/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not match www variant of suffix attack (www.example.com.evil.com)', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://www.example.com.evil.com/post/1' })
      const expected = JSON.stringify({ link: 'https://www.example.com.evil.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('preservation cases', () => {
    it('should preserve external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://external.com/post/1' })
      const expected = JSON.stringify({ link: 'https://external.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve bare external domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ href: 'https://external.com' })
      const expected = JSON.stringify({ href: 'https://external.com' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize own-host URLs embedded in text', () => {
      // Preserving these would make a feed templating its own www vs non-www host
      // into prose produce different signatures, so they are neutralized too.
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ description: 'Visit https://example.com for more' })
      const expected = JSON.stringify({ description: 'Visit / for more' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize a bare own-host domain followed by a space', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ text: 'Check https://example.com now' })
      const expected = JSON.stringify({ text: 'Check / now' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize own-host URLs carrying authentication', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://user:pass@example.com/path' })
      const expected = JSON.stringify({ link: '/path' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should end the URL token at unicode whitespace', () => {
      // fromCharCode because a literal invisible character gets mangled by tooling.
      const noBreakSpace = String.fromCharCode(0x00a0)
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ text: `see https://example.com/post/1${noBreakSpace}next` })
      const expected = JSON.stringify({ text: `see /post/1${noBreakSpace}next` })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should keep non-whitespace invisible characters inside the URL token', () => {
      // fromCharCode because a literal invisible character gets mangled by tooling.
      // A zero-width space is not regex whitespace, so it stays inside the URL.
      const zeroWidthSpace = String.fromCharCode(0x200b)
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ text: `see https://example.com/post/1${zeroWidthSpace}next` })
      const expected = JSON.stringify({ text: 'see /post/1%E2%80%8Bnext' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('error handling', () => {
    it('should return original signature for invalid URL', () => {
      const url = 'not-a-valid-url'
      const value = JSON.stringify({ title: 'Test' })
      const expected = JSON.stringify({ title: 'Test' })

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
      const value = JSON.stringify({ title: 'Hello', count: 42 })
      const expected = JSON.stringify({ title: 'Hello', count: 42 })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('multiple URLs', () => {
    it('should normalize URLs from multiple hosts', () => {
      const urls = ['https://example.com/feed', 'https://cdn.example.org/assets']
      const value = JSON.stringify({
        a: 'https://example.com/post',
        b: 'https://cdn.example.org/img',
      })
      const expected = JSON.stringify({ a: '/post', b: '/img' })

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should normalize URLs when one host is content host and one is feed host', () => {
      const urls = ['https://feeds.feedburner.com/Example', 'https://example.com']
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should handle empty urls array', () => {
      const value = JSON.stringify({ link: 'https://example.com/post' })
      const expected = JSON.stringify({ link: 'https://example.com/post' })

      expect(neutralizeUrls(value, [])).toBe(expected)
    })

    it('should ignore invalid URLs and normalize using valid ones', () => {
      const urls = ['not-a-valid-url', 'https://example.com/feed']
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })
  })

  describe.todo('potential normalizations', () => {
    it.todo('should normalize protocol-relative URLs', () => {
      // Signature contains a protocol-relative link like //example.com/post/1 on the feed host.
      // Expected: normalized to /post/1 like the absolute forms.
    })

    it.todo('should normalize uppercase protocol URLs', () => {
      // Signature contains HTTPS://EXAMPLE.COM/post/1 (uppercase scheme and host) for the
      // feed host. Expected: normalized to /post/1 case-insensitively.
    })

    it.todo('should normalize uppercase domain URLs', () => {
      // Signature contains https://EXAMPLE.COM/post/1 (uppercase host only) for the feed host.
      // Expected: normalized to /post/1 case-insensitively.
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

    it('should normalize same-domain URL when host is uppercased in the body', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'http://EXAMPLE.COM/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('regex injection', () => {
    it('should not backtrack catastrophically on a host with regex metacharacters', () => {
      // The host comes from feed content. Were it interpolated into a pattern, `(a+)+`
      // would be a ReDoS; host matching parses tokens instead, so this returns quickly.
      const url = 'http://(a+)+x.com/feed'
      const value = `"https://${'a'.repeat(40)}!"`

      const start = performance.now()
      const result = neutralizeUrls(value, [url])
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000)
      // The literal `(a+)+x.com` host is not present in the body, so nothing is neutralized.
      expect(result).toBe(value)
    })

    it('should neutralize a host containing regex metacharacters literally', () => {
      const url = 'http://a+b.example.com/feed'
      const value = JSON.stringify({ link: 'https://a+b.example.com/post' })
      const expected = JSON.stringify({ link: '/post' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })
})
