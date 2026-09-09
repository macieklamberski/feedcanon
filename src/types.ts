export type MaybePromise<T> = T | Promise<T>

// An `import type` here is stripped from the .d.ts by tsdown, leaving the alias unresolved.
export type DefaultParserResult = ReturnType<typeof import('feedsmith').parseFeed<string>>

export type ParserAdapter<T> = {
  parse: (body: string) => MaybePromise<T | undefined>
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T, url: string) => string
}

export type Rewrite = {
  match: (url: URL) => boolean
  rewrite: (url: URL) => URL
}

export type Probe = {
  match: (url: URL) => boolean
  getCandidates: (url: URL) => Array<string>
}

export type NormalizeOptions = {
  stripProtocol?: boolean
  stripAuthentication?: boolean
  stripWww?: boolean
  stripTrailingSlash?: boolean
  stripRootSlash?: boolean
  collapseSlashes?: boolean
  stripHash?: boolean
  sortQueryParams?: boolean
  stripQueryParams?: Array<string>
  stripQuery?: boolean
  stripEmptyQuery?: boolean
  lowercaseQuery?: boolean
  normalizeEncoding?: boolean
  normalizeUnicode?: boolean
}

export type Tier = Omit<NormalizeOptions, 'stripQueryParams'>

export type OnFetchFn<TResponse extends FetchFnResponse = FetchFnResponse> = (data: {
  url: string
  response: TResponse
}) => void

export type OnMatchFn<
  TFeed = unknown,
  TResponse extends FetchFnResponse = FetchFnResponse,
> = (data: { url: string; response: TResponse; feed: TFeed }) => void

export type OnExistsFn<T> = (data: { url: string; data: T }) => void

export type FindCanonicalOptions<
  TFeed = DefaultParserResult,
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
> = {
  parser?: ParserAdapter<TFeed>
  fetchFn?: FetchFn<TResponse>
  cleanUrlFn?: (url: string) => string
  existsFn?: ExistsFn<TExisting>
  rewrites?: Array<Rewrite>
  probes?: Array<Probe>
  tiers?: Array<Tier>
  onFetch?: OnFetchFn<TResponse>
  onMatch?: OnMatchFn<TFeed, TResponse>
  onExists?: OnExistsFn<TExisting>
}

export type FetchFnOptions = {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
}

export type ExistsFn<T = unknown> = (url: string) => MaybePromise<T | undefined>

export type FetchFnResponse = {
  headers: Headers
  body: string
  url: string
  status: number
}

export type FetchFn<TResponse extends FetchFnResponse = FetchFnResponse> = (
  url: string,
  options?: FetchFnOptions,
) => MaybePromise<TResponse>
