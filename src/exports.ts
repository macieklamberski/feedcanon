export { canonicalize } from './canonicalize.js'
export { defaultPlatforms, defaultStrippedParams } from './defaults.js'
export { areEquivalent } from './equivalent.js'
export { feedburnerHandler } from './platforms/feedburner.js'
export type {
  CanonicalizeMethods,
  CanonicalizeOptions,
  CanonicalizeReason,
  CanonicalizeResult,
  EquivalentMethods,
  EquivalentOptions,
  EquivalentResult,
  FeedData,
  FetchFn,
  FetchFnOptions,
  FetchFnResponse,
  HashFn,
  NormalizeOptions,
  ParserAdapter,
  PlatformHandler,
  VerifyFn,
} from './types.js'
export {
  addMissingProtocol,
  isSimilarUrl,
  normalizeUrl,
  resolveNonStandardFeedUrl,
  resolveUrl,
} from './utils.js'
