export {
  defaultFetch,
  defaultParser,
  defaultPlatforms,
  defaultStrippedParams,
  defaultTiers,
} from './defaults.js'
export { findCanonical } from './index.js'
export { feedburnerHandler } from './platforms/feedburner.js'
export type {
  ExistsFn,
  FeedsmithFeed,
  FetchFn,
  FetchFnOptions,
  FetchFnResponse,
  FindCanonicalOptions,
  NormalizeOptions,
  OnExistsFn,
  OnFetchFn,
  OnMatchFn,
  ParserAdapter,
  PlatformHandler,
} from './types.js'
export {
  addMissingProtocol,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'
