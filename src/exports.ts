export { canonicalize } from './canonicalize.js'
export { defaultPlatforms, defaultStrippedParams, defaultTiers } from './defaults.js'
export { feedburnerHandler } from './platforms/feedburner.js'
export type {
  CanonicalizeOptions,
  ExistsFn,
  FeedData,
  FetchFn,
  FetchFnOptions,
  FetchFnResponse,
  HashFn,
  NormalizeOptions,
  ParserAdapter,
  PlatformHandler,
  VerifyUrlFn,
} from './types.js'
export {
  addMissingProtocol,
  isSimilarUrl,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'
