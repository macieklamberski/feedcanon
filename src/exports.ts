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
	OnExistsFn,
	OnFetchFn,
	OnMatchFn,
	ParserAdapter,
	PlatformHandler,
} from './types.js'
export {
	addMissingProtocol,
	feedsmithParser,
	isSimilarUrl,
	normalizeUrl,
	resolveFeedProtocol,
	resolveUrl,
} from './utils.js'
