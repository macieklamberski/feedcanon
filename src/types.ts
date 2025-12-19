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
  stripProtocol?: boolean // strip protocol (http ↔ https treated same)
  stripAuthentication?: boolean // strip user:pass@
  stripWww?: boolean // strip www. prefix
  stripDefaultPorts?: boolean // strip :80 and :443
  stripTrailingSlash?: boolean // /feed/ → /feed
  stripRootSlash?: boolean // example.com/ → example.com
  collapseSlashes?: boolean // /// → /
  stripHash?: boolean // strip #fragment
  stripTextFragment?: boolean // strip #:~:text=
  sortQueryParams?: boolean // sort query params alphabetically
  stripQueryParams?: Array<string> // query params to strip
  stripEmptyQuery?: boolean // /feed? → /feed
  normalizeEncoding?: boolean // normalize %XX encoding
  lowercaseHostname?: boolean // lowercase hostname
  normalizeUnicode?: boolean // NFC normalization
  convertToPunycode?: boolean // IDNA/Punycode conversion
}

// Callback to check if URLs exist in database (early termination).
export type ExistsFn = (url: string) => Promise<boolean>

// Options for canonicalize function.
export type CanonicalizeOptions<T = unknown> = {
  parser?: ParserAdapter<T> // Required to extract selfUrl from feed.
  fetchFn?: FetchFn
  verifyUrlFn?: VerifyUrlFn
  hashFn?: HashFn
  existsFn?: ExistsFn // Check if URLs exist in database.
  tiers?: Array<NormalizeOptions> // Normalization tiers (cleanest to least clean).
  platforms?: Array<PlatformHandler> // Platform handlers (e.g., FeedBurner).
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

// URL validation function type.
export type VerifyUrlFn = (url: string) => boolean | Promise<boolean>

// Hash function type.
export type HashFn = (content: string) => string | Promise<string>
