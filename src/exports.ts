export {
  defaultFetch,
  defaultParser,
  defaultPlatforms,
  defaultStrippedParams,
  defaultTiers,
} from './defaults.js'
export { findCanonical } from './index.js'
export { feedburnerHandler } from './platforms/feedburner.js'
export { wordpressProbe } from './probes/wordpress.js'
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
  PlatformHandler,
  Probe,
} from './types.js'
export {
  addMissingProtocol,
  fixMalformedProtocol,
  normalizeUrl,
  resolveFeedProtocol,
  resolveUrl,
} from './utils.js'
