import { describe, expect, it } from 'bun:test'
import { canonicalize } from './canonicalize.js'
import type { ParserAdapter } from './types.js'

// Simple mock parser for testing.
const createMockParser = (selfUrl: string | undefined): ParserAdapter<string> => ({
  parse: (body: string) => body,
  getSelfUrl: () => selfUrl,
  getSignature: (parsed: string) => ({ content: parsed }),
})

describe('canonicalize', () => {
  it('returns no_self_url when parser is not provided', async () => {
    const mockFetch = async () => ({
      headers: new Headers(),
      body: '<feed></feed>',
      url: 'https://example.com/feed.xml',
      status: 200,
    })

    const result = await canonicalize('https://example.com/feed.xml', {
      fetchFn: mockFetch,
    })

    expect(result.reason).toBe('no_self_url')
    expect(result.url).toBe('https://example.com/feed.xml')
  })

  it('returns same_url when selfUrl equals responseUrl', async () => {
    const mockFetch = async () => ({
      headers: new Headers(),
      body: '<feed></feed>',
      url: 'https://example.com/feed.xml',
      status: 200,
    })

    const result = await canonicalize('https://example.com/feed.xml', {
      fetchFn: mockFetch,
      parser: createMockParser('https://example.com/feed.xml'),
    })

    expect(result.reason).toBe('same_url')
    expect(result.url).toBe('https://example.com/feed.xml')
  })

  it('returns normalize when URLs match after normalization', async () => {
    const mockFetch = async () => ({
      headers: new Headers(),
      body: '<feed></feed>',
      url: 'https://example.com/feed.xml',
      status: 200,
    })

    const result = await canonicalize('https://example.com/feed.xml', {
      fetchFn: mockFetch,
      parser: createMockParser('https://www.example.com/feed.xml'),
    })

    expect(result.reason).toBe('normalize')
    expect(result.url).toBe('https://www.example.com/feed.xml')
  })

  it('returns fetch_failed when fetch fails', async () => {
    const mockFetch = async () => {
      throw new Error('Network error')
    }

    const result = await canonicalize('https://example.com/feed.xml', {
      fetchFn: mockFetch,
    })

    expect(result.reason).toBe('fetch_failed')
    expect(result.url).toBe('https://example.com/feed.xml')
  })

  it('returns verification_failed when verifyFn returns false', async () => {
    const mockFetch = async () => ({
      headers: new Headers(),
      body: '<feed></feed>',
      url: 'https://example.com/feed.xml',
      status: 200,
    })

    const result = await canonicalize('https://example.com/feed.xml', {
      fetchFn: mockFetch,
      parser: createMockParser('https://other-domain.com/feed.xml'),
      verifyFn: () => false,
    })

    expect(result.reason).toBe('verification_failed')
    expect(result.url).toBe('https://example.com/feed.xml')
  })
})
