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

// Verification function type.
export type VerifyFn = (url: string) => boolean | Promise<boolean>

// Hash function type.
export type HashFn = (content: string) => string | Promise<string>

// URL normalization options.
export type NormalizeOptions = {
  protocol?: boolean // http ↔ https
  authentication?: boolean // strip user:pass@
  www?: boolean // www ↔ non-www
  port?: boolean // strip default ports (:80, :443)
  trailingSlash?: boolean // /feed/ ↔ /feed
  singleSlash?: boolean // example.com/ ↔ example.com
  slashes?: boolean // collapse /// → /
  hash?: boolean // strip #fragment
  textFragment?: boolean // strip #:~:text=
  encoding?: boolean // normalize %XX
  case?: boolean // lowercase hostname
  unicode?: boolean // NFC normalization
  punycode?: boolean // IDNA/Punycode normalization
  queryOrder?: boolean // sort query params
  emptyQuery?: boolean // /feed? ↔ /feed
  strippedParams?: string[] // tracking params to remove
}

// Result of canonicalize function.
export type CanonicalizeResult = {
  url: string
  reason: CanonicalizeReason
}

// Reason codes for canonicalize result.
export type CanonicalizeReason =
  | 'no_self_url' // selfUrl not provided.
  | 'same_url' // selfUrl === responseUrl.
  | 'verification_failed' // verifyFn returned false for selfUrl.
  | 'normalize' // URLs match after normalization → selfUrl.
  | 'redirects' // selfUrl redirects to responseUrl → selfUrl.
  | 'response_hash' // Content hash matches → selfUrl.
  | 'feed_data_hash' // Feed signature hash matches → selfUrl.
  | 'upgrade_https' // HTTP → HTTPS upgrade successful → selfUrl.
  | 'fetch_failed' // selfUrl fetch failed → responseUrl.
  | 'fallback' // No method matched → responseUrl.

// Result of areEquivalent function.
export type EquivalentResult = {
  equivalent: boolean
  method: 'normalize' | 'redirects' | 'responseHash' | 'feedDataHash' | null
}

// Normalized feed data for signature comparison.
export type FeedData = {
  title?: string
  description?: string
  items: Array<{
    id?: string
    title?: string
    link?: string
    date?: string
  }>
}

// Parser adapter interface for generic feed parser support.
export type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature?: (parsed: T) => FeedData | undefined
}

// Options for canonicalize function.
export type CanonicalizeOptions<T = unknown> = {
  parser?: ParserAdapter<T>
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
  hashFn?: HashFn
}

// Options for areEquivalent function.
export type EquivalentOptions<T = unknown> = {
  normalizeOptions?: NormalizeOptions
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
  hashFn?: HashFn
  parser?: ParserAdapter<T>
}
