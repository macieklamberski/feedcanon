import type { NormalizeOptions } from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

export const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  www: true,
  trailingSlash: true,
}
