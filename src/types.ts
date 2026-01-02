// Default feed type from feedsmith parser. Uses inline typeof import() because
// tsdown strips `import type` in .d.ts files, breaking type resolution. Can be
// simplified once feedsmith exports a ParsedFeed type directly.
export type DefaultParserResult = ReturnType<typeof import('feedsmith').parseFeed>

// Parser adapter interface for generic feed parser support.
export type ParserAdapter<T> = {
  parse: (body: string) => Promise<T | undefined> | T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T, url: string) => string
}

// URL rewrite for domain-specific normalization (e.g., FeedBurner domain aliasing).
export type Rewrite = {
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
  sortQueryParams?: boolean // sort query params alphabetically
  stripQueryParams?: Array<string> // query params to strip
  stripQuery?: boolean // strip entire query string
  stripEmptyQuery?: boolean // /feed? → /feed
  normalizeEncoding?: boolean // normalize %XX encoding
  normalizeUnicode?: boolean // NFC normalization
  convertToPunycode?: boolean // IDNA/Punycode conversion
}

// Tier options for findCanonical (stripQueryParams handled at top level).
export type Tier = Omit<NormalizeOptions, 'stripQueryParams'>

// Callback fired after each fetch operation.
export type OnFetchFn<TResponse extends FetchFnResponse = FetchFnResponse> = (data: {
  url: string
  response: TResponse
}) => void

// Callback fired when a URL successfully matches the initial response.
export type OnMatchFn<
  TFeed = unknown,
  TResponse extends FetchFnResponse = FetchFnResponse,
> = (data: { url: string; response: TResponse; feed: TFeed }) => void

// Callback fired when existsFn finds a URL in the database.
export type OnExistsFn<T> = (data: { url: string; data: T }) => void

// Options for findCanonical function.
export type FindCanonicalOptions<
  TFeed = DefaultParserResult,
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
> = {
  parser?: ParserAdapter<TFeed> // Required to extract selfUrl from feed.
  fetchFn?: FetchFn<TResponse>
  existsFn?: ExistsFn<TExisting> // Check if URLs exist in database.
  tiers?: Array<Tier> // Normalization tiers (cleanest to least clean).
  rewrites?: Array<Rewrite> // URL rewrites (e.g., FeedBurner).
  stripQueryParams?: Array<string> // Query params to strip (e.g., utm_*, doing_wp_cron).
  onFetch?: OnFetchFn<TResponse> // Called after each fetch operation.
  onMatch?: OnMatchFn<TFeed, TResponse> // Called when a URL matches the initial response.
  onExists?: OnExistsFn<TExisting> // Called when existsFn finds a URL.
}

// Options for fetch function.
export type FetchFnOptions = {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
}

// Callback to check if URLs exist in database (early termination).
// Returns data if URL exists, undefined otherwise.
export type ExistsFn<T = unknown> = (url: string) => Promise<T | undefined>

// Response from fetch function (normalized across adapters).
export type FetchFnResponse = {
  headers: Headers
  body: string
  url: string // Final URL after redirects.
  status: number
}

// Custom fetch function type (adapter interface).
export type FetchFn<TResponse extends FetchFnResponse = FetchFnResponse> = (
  url: string,
  options?: FetchFnOptions,
) => Promise<TResponse>
