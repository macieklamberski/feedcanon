export {
  defaultFetch,
  defaultParser,
  defaultRewrites,
  defaultStrippedParams,
  defaultTiers,
} from './defaults.js'
export { findCanonical } from './index.js'
export { bloggerRewrite } from './rewrites/blogger.js'
export { feedburnerRewrite } from './rewrites/feedburner.js'
export type {
  DefaultParserResult,
  ExistsFn,
  FetchFn,
  FetchFnOptions,
  FetchFnResponse,
  FindCanonicalOptions,
  NormalizeOptions,
  OnExistsFn,
  OnFetchFn,
  OnMatchFn,
  ParserAdapter,
  Rewrite,
} from './types.js'
export {
  addMissingProtocol,
  fixMalformedProtocol,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'
