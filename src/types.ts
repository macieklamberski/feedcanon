// Parser adapter interface for generic feed parser support.
export type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T) => object
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
}

// Methods configuration for canonicalize.
export type CanonicalizeMethods = {
  normalize?: NormalizeOptions // Options for URL normalization.
  redirects?: boolean // Check if selfUrl redirects to responseUrl.
  responseHash?: boolean // Compare raw response content hash.
  feedDataHash?: boolean // Compare parsed feed data hash.
  upgradeHttps?: boolean // Try HTTPS version of HTTP selfUrl.
}

// Options for canonicalize function.
export type CanonicalizeOptions<T = unknown> = {
  methods?: CanonicalizeMethods
  parser?: ParserAdapter<T> // Required to extract selfUrl from feed.
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
  hashFn?: HashFn
}

// Result of canonicalize function.
export type CanonicalizeResult = {
  url: string
  reason: CanonicalizeReason
}

// Reason codes for canonicalize result.
export type CanonicalizeReason =
  // Early exits (no fetch needed).
  | 'no_self_url' // selfUrl not provided.
  | 'same_url' // selfUrl === responseUrl.
  | 'verification_failed' // verifyFn returned false for selfUrl.
  | 'normalize' // URLs match after normalization → selfUrl.
  // After fetch.
  | 'fetch_failed' // selfUrl fetch failed → responseUrl.
  | 'redirects' // selfUrl redirects to responseUrl → responseUrl.
  | 'response_hash' // Raw content hash matches → selfUrl.
  | 'feed_data_hash' // Parsed feed data matches → selfUrl.
  | 'upgrade_https' // HTTPS version works and matches → HTTPS selfUrl.
  | 'different_content' // Content differs → responseUrl.
  | 'fallback' // No method matched → responseUrl.

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
  method: 'normalize' | 'redirects' | 'response_hash' | 'feed_data_hash' | null
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
