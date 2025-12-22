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

// Callback fired after each fetch operation.
export type OnFetchFn = (data: { url: string; response: FetchFnResponse }) => void

// Callback fired when a URL successfully matches the initial response.
export type OnMatchFn<TFeed = unknown> = (data: {
  url: string
  response: FetchFnResponse
  feed: TFeed
}) => void

// Callback fired when existsFn finds a URL in the database.
export type OnExistsFn<T> = (data: { url: string; data: T }) => void

// Callback to check if URLs exist in database (early termination).
// Returns data if URL exists, undefined otherwise.
export type ExistsFn<T = unknown> = (url: string) => Promise<T | undefined>

// Options for canonicalize function.
export type CanonicalizeOptions<TFeed = unknown, TExisting = unknown> = {
  parser?: ParserAdapter<TFeed> // Required to extract selfUrl from feed.
  fetchFn?: FetchFn
  hashFn?: HashFn
  existsFn?: ExistsFn<TExisting> // Check if URLs exist in database.
  tiers?: Array<NormalizeOptions> // Normalization tiers (cleanest to least clean).
  platforms?: Array<PlatformHandler> // Platform handlers (e.g., FeedBurner).
  onFetch?: OnFetchFn // Called after each fetch operation.
  onMatch?: OnMatchFn<TFeed> // Called when a URL matches the initial response.
  onExists?: OnExistsFn<TExisting> // Called when existsFn finds a URL.
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

// Hash function type.
export type HashFn = (content: string) => string
