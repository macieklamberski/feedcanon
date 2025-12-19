export { canonicalize } from './canonicalize.js'
export { defaultPlatforms, defaultStrippedParams, defaultTiers } from './defaults.js'
export { areEquivalent } from './equivalent.js'
export { feedburnerHandler } from './platforms/feedburner.js'
export type {
  CanonicalizeOptions,
  EquivalentMethods,
  EquivalentOptions,
  EquivalentResult,
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
