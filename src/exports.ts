import type { NormalizeOptions as TrousseNormalizeOptions } from 'trousse'
import {
  addMissingProtocol as trousseAddMissingProtocol,
  fixMalformedProtocol as trousseFixMalformedProtocol,
  normalizeUrl as trousseNormalizeUrl,
  resolveFeedProtocol as trousseResolveFeedProtocol,
  resolveUrl as trousseResolveUrl,
  upgradeProtocol as trousseUpgradeProtocol,
} from 'trousse'
import { defaultNormalizeOptions } from './defaults.js'

export {
  defaultFetch,
  defaultParser,
  defaultTiers,
} from './defaults.js'
export { findCanonical } from './index.js'
export { wordpressProbe } from './probes/wordpress.js'
export { bloggerRewrite } from './rewrites/blogger.js'
export { feedburnerRewrite } from './rewrites/feedburner.js'
export type {
  DefaultParserResult,
  ExistsFn,
  FetchFn,
  FetchFnOptions,
  FetchFnResponse,
  FindCanonicalOptions,
  OnExistsFn,
  OnFetchFn,
  OnMatchFn,
  ParserAdapter,
  Probe,
  Rewrite,
  Tier,
} from './types.js'

/** @deprecated Import from trousse. */
export const addMissingProtocol = trousseAddMissingProtocol

/** @deprecated Import from trousse. */
export const fixMalformedProtocol = trousseFixMalformedProtocol

/** @deprecated Import from trousse. */
export const normalizeUrl = (
  url: string,
  options: TrousseNormalizeOptions = defaultNormalizeOptions,
): string => {
  return trousseNormalizeUrl(url, options)
}

/** @deprecated Import from trousse. */
export const resolveFeedProtocol = trousseResolveFeedProtocol

/** @deprecated Import from trousse. */
export const resolveUrl = trousseResolveUrl

/** @deprecated Import from trousse. */
export const upgradeProtocol = trousseUpgradeProtocol

/** @deprecated Import from trousse. */
export type NormalizeOptions = TrousseNormalizeOptions
