import { createHash } from 'node:crypto'
import type { FetchFn, HashFn, NormalizeOptions, VerifyFn } from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

export const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  www: true,
  port: true,
  trailingSlash: true,
}

export const defaultFetchFn: FetchFn = async (url, options) => {
  const response = await fetch(url, {
    method: options?.method || 'GET',
    headers: options?.headers,
  })

  return {
    headers: response.headers,
    body: await response.text(),
    url: response.url,
    status: response.status,
  }
}

export const defaultHashFn: HashFn = async (content) => {
  return createHash('md5').update(content).digest('hex')
}

export const defaultVerifyFn: VerifyFn = () => {
  return true
}
