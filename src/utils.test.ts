import { describe, expect, it } from 'bun:test'
import type { Probe, Rewrite } from './types.js'
import {
  applyProbes,
  applyRewrites,
  createSignature,
  getLinkHeaderSelfUrl,
  neutralizeUrls,
} from './utils.js'

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

  it('should return undefined when no candidate works', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => undefined

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
  })

  it('should return undefined when no probe matches', async () => {
    const value = 'https://example.com/feed'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => {
      throw new Error('Should not be called')
    }

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
  })

  it('should return undefined when probes array is empty', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes: Array<Probe> = []
    const testCandidate = () => {
      throw new Error('Should not be called')
    }

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
  })

  it('should return undefined for invalid URL', async () => {
    const value = 'not a valid url'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = () => {
      throw new Error('Should not be called')
    }

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
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

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
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

  it('should await async testCandidate results', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes = [createProbe('feed', '/feed')]
    const testCandidate = async (url: string) => {
      await Bun.sleep(1)

      if (url === 'https://example.com/feed') {
        return url
      }
    }
    const expected = 'https://example.com/feed'

    expect(await applyProbes(value, probes, testCandidate)).toBe(expected)
  })

  it('should return undefined when getCandidates throws', async () => {
    const value = 'https://example.com/?feed=rss2'
    const probes: Array<Probe> = [
      {
        match: (url) => url.searchParams.has('feed'),
        getCandidates: () => {
          throw new Error('Candidates failed')
        },
      },
    ]
    const testCandidate = () => {
      throw new Error('Should not be called')
    }

    expect(await applyProbes(value, probes, testCandidate)).toBeUndefined()
  })
})

describe('getLinkHeaderSelfUrl', () => {
  it('should return target of self link', () => {
    const value = '<https://example.com/feed.xml>; rel="self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should return self link among several links', () => {
    const value =
      '<https://hub.example.com/>; rel="hub", <https://example.com/feed.xml>; rel="self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should read unquoted rel', () => {
    const value = '<https://example.com/feed.xml>; rel=self'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should read self among several space-separated rel types', () => {
    const value = '<https://example.com/feed.xml>; rel="alternate self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should match rel case-insensitively', () => {
    const value = '<https://example.com/feed.xml>; REL="Self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should match rel in IANA IRI form', () => {
    const value =
      '<https://example.com/feed.xml>; rel="http://www.iana.org/assignments/relation/self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should keep comma inside target', () => {
    const value = '<https://example.com/feed?tags=a,b>; rel="self"'
    const expected = 'https://example.com/feed?tags=a,b'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should skip comma inside quoted parameter', () => {
    const value = '<https://example.com/feed.xml>; title="News, daily"; rel="self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should ignore rel inside quoted parameter', () => {
    const value =
      '<https://example.com/atom.xml>; title="News; rel=self daily"; rel="alternate", <https://example.com/feed.xml>; rel="self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should skip self link with empty target', () => {
    const value = '<>; rel="self", <https://example.com/feed.xml>; rel="self"'
    const expected = 'https://example.com/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should return relative target as is', () => {
    const value = '</feed.xml>; rel="self"'
    const expected = '/feed.xml'

    expect(getLinkHeaderSelfUrl(value)).toBe(expected)
  })

  it('should handle a long run of parameters in linear time', () => {
    const value = `<https://example.com/feed.xml>${'; title="News'.repeat(20000)}`
    const start = performance.now()
    getLinkHeaderSelfUrl(value)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
  })

  it('should return undefined when no link has rel self', () => {
    const value = '<https://hub.example.com/>; rel="hub"'

    expect(getLinkHeaderSelfUrl(value)).toBeUndefined()
  })

  it('should not match rel type that only contains self', () => {
    const value = '<https://example.com/feed.xml>; rel="selfish"'

    expect(getLinkHeaderSelfUrl(value)).toBeUndefined()
  })

  it('should return undefined for missing header', () => {
    expect(getLinkHeaderSelfUrl(null)).toBeUndefined()
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

    expect(createSignature(value, [[value, 'generator']])).toBe(expected)
  })

  it('should neutralize multiple fields', () => {
    const value = {
      title: 'Test',
      link: 'https://example.com',
      generator: 'WordPress',
      pubDate: '2024-01-01',
    }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(
      createSignature(value, [
        [value, 'generator'],
        [value, 'pubDate'],
      ]),
    ).toBe(expected)
  })

  it('should restore original values after creating signature', () => {
    const value = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }
    const expected = { title: 'Test', link: 'https://example.com', generator: 'WordPress' }

    createSignature(value, [[value, 'generator']])

    expect(value).toEqual(expected)
  })

  it('should handle nested objects', () => {
    const value = { title: 'Test', meta: { author: 'John', date: '2024-01-01' } }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[value, 'meta']])).toBe(expected)
  })

  it('should handle arrays', () => {
    const value = { title: 'Test', items: [1, 2, 3] }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[value, 'items']])).toBe(expected)
  })

  it('should handle undefined fields', () => {
    const value: Record<string, unknown> = { title: 'Test', link: undefined }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[value, 'link']])).toBe(expected)
  })

  it('should handle field missing from object', () => {
    const value: Record<string, unknown> = { title: 'Test' }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[value, 'link']])).toBe(expected)
  })

  it('should handle empty fields array', () => {
    const value = { title: 'Test', link: 'https://example.com' }
    const expected = JSON.stringify({ title: 'Test', link: 'https://example.com' })

    expect(createSignature(value, [])).toBe(expected)
  })

  it('should omit null fields from signature', () => {
    const value: Record<string, unknown> = { title: 'Test', link: null }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[value, 'link']])).toBe(expected)
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

    expect(createSignature(value, [[value, 'link']])).toBe(expected)
  })

  it('should omit a key on a nested object', () => {
    const value = { title: 'Test', dc: { creator: 'John', dates: ['2024-01-01'] } }
    const expected = JSON.stringify({ title: 'Test', dc: { creator: 'John' } })

    expect(createSignature(value, [[value.dc, 'dates']])).toBe(expected)
  })

  it('should omit a key only on the given array element', () => {
    const value = {
      links: [
        { rel: 'self', href: 'https://example.com/feed' },
        { rel: 'alternate', href: 'https://example.com/' },
      ],
    }
    const expected = JSON.stringify({
      links: [{ rel: 'self' }, { rel: 'alternate', href: 'https://example.com/' }],
    })

    expect(createSignature(value, [[value.links[0], 'href']])).toBe(expected)
  })

  it('should ignore an exclusion whose object is undefined', () => {
    const value = { title: 'Test' }
    const expected = JSON.stringify({ title: 'Test' })

    expect(createSignature(value, [[undefined, 'title']])).toBe(expected)
  })

  it('should leave the object intact when serialization throws', () => {
    // BigInt is not serializable, so JSON.stringify throws.
    const value: Record<string, unknown> = { title: 'Test', big: 1n }
    const throwing = () => createSignature(value, [[value, 'title']])

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

    it('should keep a same-domain URL nested in the query of a neutralized URL', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.com/a?u=https://example.com/b' })
      const expected = JSON.stringify({ link: '/a?u=https://example.com/b' })

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

    it('should keep a scheme without a host unchanged', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ title: 'see https:// here' })
      const expected = JSON.stringify({ title: 'see https:// here' })

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

  describe('protocol-relative URLs', () => {
    it('should normalize protocol-relative URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: '//example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize protocol-relative URLs in HTML attributes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ content: '<img src=//example.com/image.png>' })
      const expected = JSON.stringify({ content: '<img src=/image.png>' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize URLs on the host of a protocol-relative site URL', () => {
      const urls = ['https://feeds.example.org/feed', '//example.com/']
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should normalize URLs on the host of a scheme-less site URL', () => {
      const urls = ['https://feeds.example.org/feed', 'example.com']
      const value = JSON.stringify({ link: 'https://example.com/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, urls)).toBe(expected)
    })

    it('should not treat doubled slash in path as protocol-relative URL', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://example.org/archive//example.com/post' })
      const expected = JSON.stringify({ link: 'https://example.org/archive//example.com/post' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not treat other schemes as protocol-relative URL', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'ftp://example.com/post/1' })
      const expected = JSON.stringify({ link: 'ftp://example.com/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('letter case', () => {
    it('should normalize uppercase protocol URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'HTTPS://EXAMPLE.COM/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize uppercase domain URLs', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ link: 'https://EXAMPLE.COM/post/1' })
      const expected = JSON.stringify({ link: '/post/1' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
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
        description: `
          <a href="https://example.com/a">A</a>
          and
          <a href="https://example.com/b">B</a>
        `,
      })
      const expected = JSON.stringify({
        description: `
          <a href="/a">A</a>
          and
          <a href="/b">B</a>
        `,
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

    it('should strip trailing slash from same-domain URL before escaped quote', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({ description: '<a href="https://example.com/post/">' })
      const expected = JSON.stringify({ description: '<a href="/post">' })

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

  describe('percent-encoded URLs', () => {
    it('should normalize an encoded same-domain URL inside a share link', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: 'https://share.example.org/share?url=http%3A%2F%2Fexample.com%2Fpost',
      })
      const expected = JSON.stringify({ description: 'https://share.example.org/share?url=/post' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should normalize an encoded URL with lowercase escapes', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: 'https://share.example.org/share?url=https%3a%2f%2fexample.com%2fpost',
      })
      const expected = JSON.stringify({ description: 'https://share.example.org/share?url=/post' })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should end an encoded URL at the next ampersand', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: 'https://share.example.org/share?url=http%3A%2F%2Fexample.com%2Fpost&text=Hi',
      })
      const expected = JSON.stringify({
        description: 'https://share.example.org/share?url=/post&text=Hi',
      })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should decode an encoded external domain URL without neutralizing it', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: 'https://share.example.org/share?url=http%3A%2F%2Fexternal.com%2Fpost',
      })
      const expected = JSON.stringify({
        description: 'https://share.example.org/share?url=http://external.com/post',
      })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve an encoded same-domain URL with a malformed escape', () => {
      const url = 'https://example.com/feed'
      const value = JSON.stringify({
        description: 'https://share.example.org/share?url=http%3A%2F%2Fexample.com%2Fpost%ZZ',
      })
      const expected = JSON.stringify({
        description: 'https://share.example.org/share?url=http%3A%2F%2Fexample.com%2Fpost%ZZ',
      })

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with an uppercase scheme', () => {
      const url = 'https://example.com/feed'
      const value = 'u=HTTPS%3A%2F%2Fexample.com%2Fpost'
      const expected = 'u=/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with a www host', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fwww.example.com%2Fpost'
      const expected = 'u=/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with an encoded query', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%2Fpost%3Fp%3D1'
      const expected = 'u=/post?p=1'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with an encoded fragment', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%2Fpost%23top'
      const expected = 'u=/post#top'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with the root path', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%2F'
      const expected = 'u=/'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with only a host', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com'
      const expected = 'u=/'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with a trailing slash', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%2Fpost%2F'
      const expected = 'u=/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize two encoded URLs in one text', () => {
      const url = 'https://example.com/feed'
      const value = 'a=http%3A%2F%2Fexample.com%2Fa b=https%3A%2F%2Fexample.com%2Fb'
      const expected = 'a=/a b=/b'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should end an encoded URL at a JSON-escaped quote', () => {
      const url = 'https://example.com/feed'
      const value = '"href":"https://s.example.org/share?u=http%3A%2F%2Fexample.com%2Fpost\\"'
      const expected = '"href":"https://s.example.org/share?u=/post\\"'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL at the end of the text', () => {
      const url = 'https://example.com/feed'
      const value = 'http%3A%2F%2Fexample.com%2Fpost'
      const expected = '/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an encoded URL with an IDN host', () => {
      const url = 'https://bücher.example/feed'
      const value = 'u=http%3A%2F%2Fb%C3%BCcher.example%2Fpost'
      const expected = 'u=/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should neutralize an own URL inside an encoded foreign URL', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fforeign.org%2F%3Fu%3Dhttp%3A%2F%2Fexample.com%2Fpost'
      const expected = 'u=http://foreign.org/?u=/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should end an encoded URL at a decoded space', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%2Fa%20b'
      const expected = 'u=/a b'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not neutralize an encoded URL with a lookalike host', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com.evil.org%2Fpost'
      const expected = 'u=http://example.com.evil.org/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should not neutralize an encoded URL with a different port', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%3A%2F%2Fexample.com%3A8080%2Fpost'
      const expected = 'u=http://example.com:8080/post'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })

    it('should preserve an encoded URL with a non-http scheme', () => {
      const url = 'https://example.com/feed'
      const value = 'u=ftp%3A%2F%2Fexample.com%2Fpost'

      expect(neutralizeUrls(value, [url])).toBe(value)
    })

    it('should preserve an encoded protocol-relative URL', () => {
      const url = 'https://example.com/feed'
      const value = 'u=%2F%2Fexample.com%2Fpost'

      expect(neutralizeUrls(value, [url])).toBe(value)
    })

    it('should preserve a double-encoded URL', () => {
      const url = 'https://example.com/feed'
      const value = 'u=http%253A%252F%252Fexample.com%252Fpost'

      expect(neutralizeUrls(value, [url])).toBe(value)
    })

    it('should decode an encoded scheme with no host', () => {
      const url = 'https://example.com/feed'
      const value = 'u=https%3A%2F%2F'
      const expected = 'u=https://'

      expect(neutralizeUrls(value, [url])).toBe(expected)
    })
  })

  describe('pathological input', () => {
    it('should finish quickly on a long run of slashes', () => {
      const url = 'https://example.com/feed'
      const value = '/'.repeat(200_000)

      const start = performance.now()
      neutralizeUrls(value, [url])
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000)
    })

    it('should finish quickly on many protocol-relative prefixes in one token', () => {
      const url = 'https://example.com/feed'
      const value = '//-'.repeat(70_000)

      const start = performance.now()
      neutralizeUrls(value, [url])
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000)
    })

    it('should finish quickly on many percent-encoded schemes in one token', () => {
      const url = 'https://example.com/feed'
      const value = 'http%3A%2F%2F'.repeat(15_400)

      const start = performance.now()
      neutralizeUrls(value, [url])
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000)
    })
  })
})
