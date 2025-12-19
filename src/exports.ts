export { canonicalize } from './canonicalize.js'
export { areEquivalent } from './equivalent.js'
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
  VerifyFn,
} from './types.js'
export {
  addMissingProtocol,
  isSimilarUrl,
  normalizeUrl,
  resolveNonStandardFeedUrl,
  resolveUrl,
} from './utils.js'
