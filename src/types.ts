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
  www?: boolean // www ↔ non-www
  trailingSlash?: boolean // /feed/ ↔ /feed
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
  | 'fetch_failed' // selfUrl fetch failed → responseUrl.
  | 'fallback' // No method matched → responseUrl.

// Result of areEquivalent function.
export type EquivalentResult = {
  equivalent: boolean
  method: 'normalize' | null
}

// Parser adapter interface for generic feed parser support.
export type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
}

// Options for canonicalize function.
export type CanonicalizeOptions<T = unknown> = {
  parser?: ParserAdapter<T>
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
}

// Options for areEquivalent function.
export type EquivalentOptions = {
  normalizeOptions?: NormalizeOptions
  fetchFn?: FetchFn
  verifyFn?: VerifyFn
}
