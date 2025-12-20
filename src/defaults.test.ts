import { describe, expect, it } from 'bun:test'
import { defaultHashFn, defaultVerifyUrlFn } from './defaults.js'

describe('defaultVerifyUrlFn', () => {
  it('should return true for any URL', () => {
    const result = defaultVerifyUrlFn('https://example.com/feed')

    expect(result).toBe(true)
  })

  it('should return true for empty string', () => {
    const result = defaultVerifyUrlFn('')

    expect(result).toBe(true)
  })

  it('should return true for invalid URL', () => {
    const result = defaultVerifyUrlFn('not a valid url')

    expect(result).toBe(true)
  })

  it('should return true for localhost', () => {
    const result = defaultVerifyUrlFn('https://localhost/feed')

    expect(result).toBe(true)
  })

  it('should return true for private IP', () => {
    const result = defaultVerifyUrlFn('https://192.168.1.1/feed')

    expect(result).toBe(true)
  })
})

describe('defaultHashFn', () => {
  it('should return MD5 hash of content', async () => {
    const value = 'hello world'
    const result = await defaultHashFn(value)
    const expected = '5eb63bbbe01eeed093cb22bb8f5acdc3'

    expect(result).toBe(expected)
  })

  it('should return different hashes for different content', async () => {
    const result1 = await defaultHashFn('content1')
    const result2 = await defaultHashFn('content2')

    expect(result1).not.toBe(result2)
  })

  it('should return same hash for identical content', async () => {
    const result1 = await defaultHashFn('same content')
    const result2 = await defaultHashFn('same content')

    expect(result1).toBe(result2)
  })

  it('should return hash for empty string', async () => {
    const value = ''
    const result = await defaultHashFn(value)
    const expected = 'd41d8cd98f00b204e9800998ecf8427e'

    expect(result).toBe(expected)
  })

  it('should return 32-character hex string', async () => {
    const result = await defaultHashFn('any content')

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle unicode content', async () => {
    const value = 'こんにちは世界'
    const result = await defaultHashFn(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle special characters', async () => {
    const value = '<feed><item>Test & "quotes"</item></feed>'
    const result = await defaultHashFn(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle very long content', async () => {
    const value = 'x'.repeat(100000)
    const result = await defaultHashFn(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle newlines and whitespace', async () => {
    const value = 'line1\nline2\r\nline3\ttab'
    const result = await defaultHashFn(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })
})
