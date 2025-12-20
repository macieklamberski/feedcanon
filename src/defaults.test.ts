import { describe, expect, it } from 'bun:test'
import { createMd5Hash } from './utils.js'

describe('createMd5Hash', () => {
  it('should return MD5 hash of content', async () => {
    const value = 'hello world'
    const result = await createMd5Hash(value)
    const expected = '5eb63bbbe01eeed093cb22bb8f5acdc3'

    expect(result).toBe(expected)
  })

  it('should return different hashes for different content', async () => {
    const result1 = await createMd5Hash('content1')
    const result2 = await createMd5Hash('content2')

    expect(result1).not.toBe(result2)
  })

  it('should return same hash for identical content', async () => {
    const result1 = await createMd5Hash('same content')
    const result2 = await createMd5Hash('same content')

    expect(result1).toBe(result2)
  })

  it('should return hash for empty string', async () => {
    const value = ''
    const result = await createMd5Hash(value)
    const expected = 'd41d8cd98f00b204e9800998ecf8427e'

    expect(result).toBe(expected)
  })

  it('should return 32-character hex string', async () => {
    const result = await createMd5Hash('any content')

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle unicode content', async () => {
    const value = 'こんにちは世界'
    const result = await createMd5Hash(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle special characters', async () => {
    const value = '<feed><item>Test & "quotes"</item></feed>'
    const result = await createMd5Hash(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle very long content', async () => {
    const value = 'x'.repeat(100000)
    const result = await createMd5Hash(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })

  it('should handle newlines and whitespace', async () => {
    const value = 'line1\nline2\r\nline3\ttab'
    const result = await createMd5Hash(value)

    expect(result.length).toBe(32)
    expect(result).toMatch(/^[a-f0-9]+$/)
  })
})
