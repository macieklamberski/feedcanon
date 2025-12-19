// Parser adapter interface for generic feed parser support.
export type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T) => object
}

// Platform handler for URL normalization (e.g., FeedBurner domain aliasing).
export type PlatformHandler = {
  match: (url: URL) => boolean
  normalize: (url: URL) => URL
}

// URL normalization options.
export type NormalizeOptions = {
  protocol?: boolean // strip protocol (http ↔ https treated same)
  authentication?: boolean // strip user:pass@ (default: false - keep auth)
  www?: boolean // www ↔ non-www
  port?: boolean // strip default ports (:80, :443)
  trailingSlash?: boolean // /feed/ ↔ /feed
  singleSlash?: boolean // example.com/ ↔ example.com
  slashes?: boolean // collapse /// → /
  hash?: boolean // strip #fragment
  textFragment?: boolean // strip #:~:text=
  queryOrder?: boolean // sort query params
  strippedParams?: Array<string> // params to strip, defaults to trackingParameters
  emptyQuery?: boolean // /feed? ↔ /feed
  encoding?: boolean // normalize %XX
  case?: boolean // lowercase hostname
  unicode?: boolean // NFC normalization
  punycode?: boolean // IDNA/Punycode normalization
  platforms?: Array<PlatformHandler> | false // platform-specific normalization (false to disable)
}

// Callback to check if URLs exist in database (early termination).
export type ExistsFn = (url: string) => Promise<boolean>

// Options for canonicalize function.
export type CanonicalizeOptions<T = unknown> = {
  parser?: ParserAdapter<T> // Required to extract selfUrl from feed.
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
  hashFn?: HashFn
  tiers?: Array<NormalizeOptions> // Normalization tiers (cleanest to least clean).
  existsFn?: ExistsFn // Check if URLs exist in database.
}

// Result of canonicalize function.
export type CanonicalizeResult = {
  url: string
  reason: CanonicalizeReason
}

// Reason codes for canonicalize result.
export type CanonicalizeReason =
  | 'exists_in_db' // URL exists in database (early exit via existsFn).
  | 'content_verified' // Cleaner variant verified via content hash match.
  | 'upgrade_https' // HTTPS version works and matches.
  | 'fetch_failed' // Initial fetch failed.
  | 'fallback' // No cleaner variant worked, using variantSource.

// Methods configuration for areEquivalent.
export type EquivalentMethods = {
  normalize?: NormalizeOptions // Options for URL normalization.
  redirects?: boolean // Check if one redirects to other.
  responseHash?: boolean // Compare raw response content hash.
  feedDataHash?: boolean // Compare parsed feed data hash.
}

// Options for areEquivalent function.
export type EquivalentOptions<T = unknown> = {
  methods?: EquivalentMethods
  parser?: ParserAdapter<T>
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
  hashFn?: HashFn
}

// Result of areEquivalent function.
export type EquivalentResult = {
  equivalent: boolean
  method?: 'normalize' | 'redirects' | 'response_hash' | 'feed_data_hash'
}

// Options for fetch function.
export type FetchFnOptions = {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
}

// Response from fetch function (normalized across adapters).
export type FetchFnResponse = {
  headers: Headers
  body: string
  url: string // Final URL after redirects.
  status: number
}

// Custom fetch function type (adapter interface).
export type FetchFn = (url: string, options?: FetchFnOptions) => Promise<FetchFnResponse>

// Parsed feed data for comparison.
export type FeedData = {
  title?: string
  description?: string
  siteUrl?: string
  items?: Array<{
    guid?: string
    link?: string
    title?: string
    publishedAt?: string
  }>
}

// Verification function type.
export type VerifyFn = (url: string) => boolean | Promise<boolean>

// Hash function type.
export type HashFn = (content: string) => string | Promise<string>
