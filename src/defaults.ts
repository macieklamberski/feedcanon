import type { FetchFn, NormalizeOptions } from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

export const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  www: true,
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
