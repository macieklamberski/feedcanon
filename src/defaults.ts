import { createHash } from 'node:crypto'
import type { FetchFn, HashFn, NormalizeOptions, VerifyFn } from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

export const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  authentication: true,
  www: true,
  port: true,
  trailingSlash: true,
  singleSlash: true,
  slashes: true,
  hash: true,
  textFragment: true,
  encoding: true,
  case: true,
  unicode: true,
  punycode: true,
  queryOrder: true,
  emptyQuery: true,
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

// Default methods to use for areEquivalent.
export const defaultEquivalentMethods = {
  normalize: true,
  redirects: true,
  responseHash: true,
  feedDataHash: true,
}

// Default methods to use for canonicalize.
export const defaultCanonicalizeMethods = {
  normalize: true,
  redirects: true,
  responseHash: true,
  feedDataHash: true,
  upgradeHttps: true,
}

// Default tracking parameters to strip from URLs.
export const defaultStrippedParams = [
  // UTM parameters (Google Analytics).
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',

  // Social media click identifiers.
  'fbclid', // Facebook
  'twclid', // Twitter
  'gclid', // Google Ads
  'dclid', // DoubleClick
  'msclkid', // Microsoft Ads
  'li_fat_id', // LinkedIn
  'igshid', // Instagram
  'ttclid', // TikTok
]
