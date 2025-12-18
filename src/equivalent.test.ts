import { describe, expect, it } from 'bun:test'
import { areEquivalent } from './equivalent.js'

describe('areEquivalent', () => {
  it('returns true with normalize method for identical URLs', async () => {
    const result = await areEquivalent(
      'https://example.com/feed.xml',
      'https://example.com/feed.xml',
    )

    expect(result.equivalent).toBe(true)
    expect(result.method).toBe('normalize')
  })

  it('returns true with normalize method for URLs differing only by protocol', async () => {
    const result = await areEquivalent(
      'http://example.com/feed.xml',
      'https://example.com/feed.xml',
    )

    expect(result.equivalent).toBe(true)
    expect(result.method).toBe('normalize')
  })

  it('returns true with normalize method for URLs differing only by www', async () => {
    const result = await areEquivalent(
      'https://www.example.com/feed.xml',
      'https://example.com/feed.xml',
    )

    expect(result.equivalent).toBe(true)
    expect(result.method).toBe('normalize')
  })

  it('returns false when verification fails', async () => {
    const result = await areEquivalent('https://example.com/feed1', 'https://example.com/feed2', {
      verifyFn: () => false,
    })

    expect(result.equivalent).toBe(false)
    expect(result.method).toBeNull()
  })

  it('returns true with redirects method when URLs redirect to same destination', async () => {
    const mockFetch = async (url: string) => ({
      headers: new Headers(),
      body: '<feed></feed>',
      url: 'https://example.com/canonical.xml', // Both redirect to same URL.
      status: 200,
    })

    const result = await areEquivalent('https://example.com/feed1', 'https://example.com/feed2', {
      fetchFn: mockFetch,
    })

    expect(result.equivalent).toBe(true)
    expect(result.method).toBe('redirects')
  })

  it('returns true with response_hash method when content hashes match', async () => {
    const mockFetch = async (url: string) => ({
      headers: new Headers(),
      body: '<feed><item>Same content</item></feed>',
      url: url, // Different final URLs.
      status: 200,
    })

    const result = await areEquivalent('https://example.com/feed1', 'https://example.com/feed2', {
      fetchFn: mockFetch,
    })

    expect(result.equivalent).toBe(true)
    expect(result.method).toBe('response_hash')
  })

  it('returns false when URLs are different and content differs', async () => {
    let callCount = 0
    const mockFetch = async (url: string) => ({
      headers: new Headers(),
      body: `<feed><item>Content ${callCount++}</item></feed>`,
      url: url,
      status: 200,
    })

    const result = await areEquivalent('https://example.com/feed1', 'https://example.com/feed2', {
      fetchFn: mockFetch,
    })

    expect(result.equivalent).toBe(false)
    expect(result.method).toBeNull()
  })
})
