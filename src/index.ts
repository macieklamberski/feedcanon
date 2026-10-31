import {
  addMissingScheme,
  createUrlSpellings,
  createUrlVariants,
  isFunction,
  isHttpUrl,
  isPresent,
  normalizeUrl,
  parseUrl,
  resolveFeedScheme,
  resolveUrl,
  upgradeScheme,
} from 'trousse'
import { defaultFetch, defaultParser, defaultTiers } from './defaults.js'
import type {
  DefaultParserResult,
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
} from './types.js'
import { applyProbes, applyRewrites, getLinkHeaderSelfUrl } from './utils.js'

// A URL findCanonical returns, with the existsFn data when existsFn knows it, and the response
// that served it, with its feed.
type CanonicalResult = {
  url: string
  uncleanedUrl?: string // The URL the response came from, when url is its unfetched cleaned form
  data?: unknown
  response: FetchFnResponse
  feed: unknown
}

// What testing a list of candidates ends on. A result is moved when it is the target of a
// permanent redirect that existsFn does not know, which is where the search goes on.
type CandidateTest = {
  result: CanonicalResult
  isMoved: boolean
}

const permanentRedirectStatuses = [301, 308]

// Overload 1: Default DefaultParserResult, parser optional.
export function findCanonical<
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
>(
  inputUrl: string,
  options?: Omit<FindCanonicalOptions<DefaultParserResult, TResponse, TExisting>, 'parser'>,
): Promise<string | undefined>

// Overload 2: Custom TFeed, parser required.
export function findCanonical<
  TFeed,
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
>(
  inputUrl: string,
  options: FindCanonicalOptions<TFeed, TResponse, TExisting> & { parser: ParserAdapter<TFeed> },
): Promise<string | undefined>

// Implementation uses 'any' for TFeed to avoid variance issues with parser default. Type safety is
// enforced by the overload signatures above. An error thrown by existsFn, cleanUrlFn or a callback
// resolves to undefined, like any other failure.
export async function findCanonical(
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for function overloads.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> {
  try {
    const result = await resolveCanonical(inputUrl, options)

    if (!result) {
      return
    }

    if (result.data != null) {
      options?.onExists?.({ url: result.url, data: result.data })
    }

    options?.onCanonical?.({ url: result.url, response: result.response, feed: result.feed })

    return result.url
  } catch {}
}

const resolveCanonical = async (
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Same as the findCanonical implementation.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<CanonicalResult | undefined> => {
  const {
    parser = defaultParser,
    fetchFn = defaultFetch,
    cleanUrlFn = (url: string) => url,
    existsFn,
    tiers = defaultTiers,
    rewrites = [],
    probes = [],
    maxHops: maxHopsOption,
    onFetch,
    onMatch,
  } = options ?? {}

  // Infinity would never run out, so only a finite number replaces the default.
  let maxHops = 20

  if (maxHopsOption !== undefined && Number.isFinite(maxHopsOption)) {
    maxHops = maxHopsOption
  }

  // For URLs a person or markup wrote: the input URL and the feed's self link. resolveUrl repairs
  // schemes, resolves relative paths and decodes character references. A URL a server sent is
  // not repaired that way: it goes through parseHttpUrl.
  const resolveAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)

    if (!resolved) {
      return
    }

    return applyRewrites(resolved, rewrites)
  }

  // A response or redirect URL is already final, and resolveUrl would decode character references
  // in it, turning `/a&amp;b` into a URL that was never fetched.
  const parseHttpUrl = (url: string, baseUrl?: string): string | undefined => {
    const parsed = parseUrl(url, baseUrl)

    if (!parsed || !isHttpUrl(parsed)) {
      return
    }

    return parsed.href
  }

  // For URLs a server sent that are fetched next: the Link header self URL and tier candidates.
  const parseAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const parsed = parseHttpUrl(url, baseUrl)

    if (!parsed) {
      return
    }

    return applyRewrites(parsed, rewrites)
  }

  // Phase 1: Initial fetch.
  let initialRequestUrl = resolveAndApplyRewrites(inputUrl)

  if (!initialRequestUrl) {
    return
  }

  // A pseudo-scheme such as feed:// names no transport. An http-only host fails over https with a
  // thrown TLS or connection error, or a non-2xx from another virtual host.
  // See: https://www.iana.org/assignments/uri-schemes/prov/feed (draft-obasanjo-feed-uri-scheme).
  const initialRequestUrls = [initialRequestUrl]
  const trimmedInputUrl = inputUrl.trim()
  const httpInputUrl = resolveFeedScheme(trimmedInputUrl, 'http')

  if (httpInputUrl !== resolveFeedScheme(trimmedInputUrl)) {
    const httpRequestUrl = resolveAndApplyRewrites(httpInputUrl)

    // A rewrite that forces https, such as bloggerRewrite, maps both forms to one URL.
    if (httpRequestUrl && httpRequestUrl !== initialRequestUrl) {
      initialRequestUrls.push(httpRequestUrl)
    }
  }

  // Redirects in every response the call has received.
  let hopCount = 0

  // Fetch a URL and report it to onFetch. Returns the response only when it is a 2xx.
  const fetchSuccess = async (url: string): Promise<FetchFnResponse | undefined> => {
    // A rewrite or a probe can hand over anything, and only an http URL is ever requested.
    if (!parseHttpUrl(url)) {
      return
    }

    let response: FetchFnResponse

    try {
      response = await fetchFn(url)
    } catch {
      return
    }

    // A fetchFn written without types can resolve to nothing, which is a failed request.
    if (!response) {
      return
    }

    onFetch?.({ url, response })

    // A fetchFn that lists no redirects still shows one when the response ended elsewhere.
    let redirectCount = response.redirects?.length ?? 0

    if (redirectCount === 0 && parseHttpUrl(response.url) !== url) {
      redirectCount = 1
    }

    hopCount += redirectCount

    if (response.status < 200 || response.status >= 300) {
      return
    }

    return response
  }

  let initialResponse: FetchFnResponse | undefined

  for (const requestUrl of initialRequestUrls) {
    const response = await fetchSuccess(requestUrl)

    if (response) {
      initialRequestUrl = requestUrl
      initialResponse = response
      break
    }
  }

  if (!initialResponse) {
    return
  }

  const initialResponseUrlRaw = parseHttpUrl(initialResponse.url)

  if (!initialResponseUrlRaw) {
    return
  }

  // The URL that served the initial body. Self URLs resolve against it, and its signature uses it,
  // as a compared response's signature uses the URL that served that body.
  const initialBaseUrl = normalizeUrl(initialResponseUrlRaw, {
    sortQueryParams: true,
    stripEmptyQuery: true,
  })

  const initialResponseBody = initialResponse.body

  if (!initialResponseBody) {
    return
  }

  // Phase 2: Extract and normalize self URLs.
  const selfRequestUrls: Array<string> = []

  let initialResponseFeed: Awaited<ReturnType<typeof parser.parse>>

  try {
    initialResponseFeed = await parser.parse(initialResponseBody)
  } catch {
    return
  }

  if (!initialResponseFeed) {
    return
  }

  const matchedUrls: Array<string> = []

  // Every match receives initialResponseFeed, since a match serves the same feed, so consumers skip
  // a second parse. A later phase can reach a matched URL again through the fetch cache, so each
  // URL is reported once.
  const reportMatch = (url: string, response: FetchFnResponse): void => {
    if (matchedUrls.includes(url)) {
      return
    }

    matchedUrls.push(url)
    onMatch?.({ url, response, feed: initialResponseFeed })
  }

  reportMatch(initialRequestUrl, initialResponse)

  // A fetchFn written without types can return no Headers object, which carries no Link header.
  const hasHeaders = isFunction(initialResponse.headers?.get)
  const linkHeader = hasHeaders ? initialResponse.headers.get('link') : null

  // A self link in the Link header takes precedence over one in the feed body. The header is an
  // HTTP field, not markup, so its URL is parsed without decoding character references.
  // See: https://www.w3.org/TR/websub/#discovery.
  const linkHeaderSelfUrl = getLinkHeaderSelfUrl(linkHeader)
  const feedSelfUrl = parser.getSelfUrl(initialResponseFeed, initialBaseUrl)
  const declaredSelfUrls: Array<string | undefined> = []

  if (linkHeaderSelfUrl) {
    declaredSelfUrls.push(parseAndApplyRewrites(linkHeaderSelfUrl, initialBaseUrl))
  }

  if (feedSelfUrl) {
    declaredSelfUrls.push(resolveAndApplyRewrites(feedSelfUrl, initialBaseUrl))
  }

  for (const selfRequestUrl of declaredSelfUrls) {
    if (!selfRequestUrl) {
      continue
    }

    const cleanedSelfRequestUrl = cleanUrlFn(selfRequestUrl)

    if (!selfRequestUrls.includes(cleanedSelfRequestUrl)) {
      selfRequestUrls.push(cleanedSelfRequestUrl)
    }
  }

  // Compare initial response against another response using 2-tier matching:
  // 1. Exact body match (fastest).
  // 2. Signature match (semantic equality via parser).
  const compareWithInitialResponse = async (
    comparedResponseBody: string | undefined,
    comparedResponseUrl: string,
  ): Promise<boolean> => {
    if (!comparedResponseBody) {
      return false
    }

    // Tier 1: Exact body match.
    if (initialResponseBody === comparedResponseBody) {
      return true
    }

    // Tier 2: Signature match via parser.
    let comparedResponseFeed: Awaited<ReturnType<typeof parser.parse>>

    try {
      comparedResponseFeed = await parser.parse(comparedResponseBody)
    } catch {
      return false
    }

    if (!comparedResponseFeed) {
      return false
    }

    // A signature that throws fails this comparison only, as a parse that throws does.
    try {
      // Each feed with its own host dropped: copies that each link their own host match.
      const isSameWithOwnHosts =
        parser.getSignature(initialResponseFeed, initialBaseUrl) ===
        parser.getSignature(comparedResponseFeed, comparedResponseUrl)

      if (isSameWithOwnHosts) {
        return true
      }

      // Each side gets the URL of the other and keeps hosts, so copies that link the same hosts
      // and differ only in URL form match too. Feeds that link each other's host do not.
      const initialResponseSignature = parser.getSignature(initialResponseFeed, initialBaseUrl, [
        comparedResponseUrl,
      ])
      const comparedResponseSignature = parser.getSignature(
        comparedResponseFeed,
        comparedResponseUrl,
        [initialBaseUrl],
      )

      return initialResponseSignature === comparedResponseSignature
    } catch {
      return false
    }
  }

  // Phases can try the same URL again, so each URL is fetched once and its result reused.
  const comparedResponses = new Map<string, FetchFnResponse | undefined>([
    [initialRequestUrl, initialResponse],
  ])

  // An https form that failed in Phase 1 fails again when Phase 7 upgrades the http fallback.
  if (initialRequestUrl !== initialRequestUrls[0]) {
    comparedResponses.set(initialRequestUrls[0], undefined)
  }

  // The final URL of the initial response served it too, so a later phase does not fetch it again.
  // This also clears the failure above when the http fallback was served by that https form.
  comparedResponses.set(initialResponseUrlRaw, initialResponse)

  // Whether a URL is http: the final URL a response landed on, or the URL a result is kept under.
  const isServedOverHttp = (url: string): boolean => {
    return !!parseHttpUrl(url)?.startsWith('http://')
  }

  // The URL a response fetched for requestUrl is kept under. A response that ends at requestUrl,
  // such as the initial response cached under its final URL, is kept there, since the redirects
  // it carries came from another request.
  const getFetchedSourceUrl = (
    response: FetchFnResponse,
    requestUrl: string,
  ): string | undefined => {
    if (parseHttpUrl(response.url) === requestUrl) {
      return requestUrl
    }

    // Its final URL, or the URL before its first temporary redirect, since a client keeps using
    // the URI it requested through a 302, 303 or 307.
    // See: https://www.rfc-editor.org/rfc/rfc9110#section-15.4.
    const temporaryRedirect = response.redirects?.find((redirect) => {
      return !permanentRedirectStatuses.includes(redirect.status)
    })

    return parseHttpUrl(temporaryRedirect?.url ?? response.url)
  }

  // Phases can adopt the same URL again, so each URL is looked up in existsFn once.
  const existingData: Record<string, unknown> = {}

  // Fetch URL and compare with initial response. Returns response if match, undefined otherwise.
  const fetchAndCompare = async (url: string): Promise<FetchFnResponse | undefined> => {
    if (comparedResponses.has(url)) {
      const comparedResponse = comparedResponses.get(url)

      if (comparedResponse) {
        reportMatch(url, comparedResponse)
      }

      return comparedResponse
    }

    // Every exit below is a failure except the last, so the URL counts as failed until it matches.
    comparedResponses.set(url, undefined)

    const response = await fetchSuccess(url)

    if (!response) {
      return
    }

    if (!(await compareWithInitialResponse(response.body, response.url))) {
      return
    }

    comparedResponses.set(url, response)
    reportMatch(url, response)

    return response
  }

  // Look a URL up in existsFn, including its form under the other protocol and the spellings of
  // both a server reads as the same url. A known form must serve the same feed in this call, unless
  // it is the URL of verifiedResult, which already did.
  const findExistingUrl = async (
    url: string,
    verifiedResult?: CanonicalResult,
  ): Promise<CanonicalResult | undefined> => {
    if (!existsFn) {
      return
    }

    const schemeUrls = [url]

    if (url.startsWith('https://')) {
      schemeUrls.push(upgradeScheme(url, 'http'))
    }

    if (url.startsWith('http://')) {
      schemeUrls.push(upgradeScheme(url, 'https'))
    }

    const lookupUrls = new Set(schemeUrls.flatMap((schemeUrl) => createUrlSpellings(schemeUrl)))

    for (const lookupUrl of lookupUrls) {
      if (!(lookupUrl in existingData)) {
        existingData[lookupUrl] = await existsFn(lookupUrl)
      }

      const data = existingData[lookupUrl]

      if (data == null) {
        continue
      }

      if (!verifiedResult || lookupUrl !== url) {
        const response = await fetchAndCompare(lookupUrl)

        if (!response) {
          continue
        }

        const sourceUrl = getFetchedSourceUrl(response, lookupUrl)

        // A candidate that redirects permanently is not where the feed lives, so its target is
        // tested instead, known or not.
        if (lookupUrl === url && sourceUrl && sourceUrl !== url) {
          continue
        }

        return { url: lookupUrl, data, response, feed: initialResponseFeed }
      }

      return { ...verifiedResult, data }
    }
  }

  // An adopted result with its existsFn data when existsFn knows its URL, or the final URL of
  // its response.
  const findCanonicalResult = async (result: CanonicalResult): Promise<CanonicalResult> => {
    const existingUrl = await findExistingUrl(result.url, result)

    if (existingUrl) {
      return existingUrl
    }

    // A response kept under the URL before a temporary redirect was served by its final URL too.
    // A final URL existsFn knows wins, so a feed stored under it is not stored twice.
    const finalUrl = parseHttpUrl(result.response.url)

    if (!finalUrl) {
      return result
    }

    const finalResult = adoptQueryCleanedUrl(finalUrl, result.response)

    const existingFinalUrl = await findExistingUrl(finalResult.url, finalResult)

    if (!existingFinalUrl) {
      return result
    }

    return existingFinalUrl
  }

  // A rewrite of a fetched URL names a URL nobody fetched, so it is used only once verified to
  // serve the same feed. Otherwise the fetched URL is kept, with the response that served it.
  const adoptRewrittenUrl = async (
    fetchedUrl: string,
    requestUrl: string,
    response: FetchFnResponse,
  ): Promise<CanonicalResult> => {
    const rewrittenUrl = applyRewrites(fetchedUrl, rewrites)

    if (rewrittenUrl === fetchedUrl) {
      return adoptCleanedUrl(fetchedUrl, requestUrl, response)
    }

    const rewrittenResponse = await fetchAndCompare(rewrittenUrl)

    if (!rewrittenResponse) {
      return adoptCleanedUrl(fetchedUrl, requestUrl, response)
    }

    const targetUrl = getFetchedSourceUrl(rewrittenResponse, rewrittenUrl) ?? rewrittenUrl

    // A target the rewrites would change again undoes the rewrite, so the rewritten URL is kept.
    if (targetUrl === rewrittenUrl || applyRewrites(targetUrl, rewrites) !== targetUrl) {
      return adoptCleanedUrl(rewrittenUrl, rewrittenUrl, rewrittenResponse)
    }

    // A rewritten URL that redirects permanently is not where the feed lives, so its target is.
    return adoptQueryCleanedUrl(targetUrl, rewrittenResponse)
  }

  const hasFailed = (url: string): boolean => {
    return comparedResponses.has(url) && !comparedResponses.get(url)
  }

  const isSameLocation = (url: string, otherUrl: string): boolean => {
    const parsed = parseUrl(url)
    const otherParsed = parseUrl(otherUrl)

    return parsed?.origin === otherParsed?.origin && parsed?.pathname === otherParsed?.pathname
  }

  const createResult = (url: string, response: FetchFnResponse): CanonicalResult => {
    return { url, response, feed: initialResponseFeed }
  }

  // A redirect target or the final URL of a response, with its query cleaned. A URL the cleaner
  // moves to another origin or path names one more URL nobody fetched, so it is kept as it is.
  const adoptQueryCleanedUrl = (url: string, response: FetchFnResponse): CanonicalResult => {
    const cleanedUrl = cleanUrlFn(url)

    if (!isSameLocation(url, cleanedUrl) || hasFailed(cleanedUrl)) {
      return createResult(url, response)
    }

    return { ...createResult(cleanedUrl, response), uncleanedUrl: url }
  }

  // A cleaner that only edits the query is trusted. One that moves the URL to another origin or
  // path (an unwrapped redirect link) is used only once verified to serve the same feed, even when
  // existsFn knows it. Otherwise the response URL is kept, with the response that served it.
  const adoptCleanedUrl = async (
    responseUrl: string,
    requestUrl: string,
    response: FetchFnResponse,
  ): Promise<CanonicalResult> => {
    const cleanedUrl = cleanUrlFn(responseUrl)

    // A cleaned URL that failed earlier in the call is not trusted, even for a query-only edit.
    if (hasFailed(cleanedUrl)) {
      return createResult(responseUrl, response)
    }

    if (isSameLocation(responseUrl, cleanedUrl) || cleanedUrl === requestUrl) {
      return { ...createResult(cleanedUrl, response), uncleanedUrl: responseUrl }
    }

    const cleanedResponse = await fetchAndCompare(cleanedUrl)

    if (!cleanedResponse) {
      return createResult(responseUrl, response)
    }

    const targetUrl = getFetchedSourceUrl(cleanedResponse, cleanedUrl) ?? cleanedUrl

    if (targetUrl === cleanedUrl) {
      return createResult(cleanedUrl, cleanedResponse)
    }

    // A cleaned URL that redirects permanently is not where the feed lives, so its target is.
    return adoptQueryCleanedUrl(targetUrl, cleanedResponse)
  }

  // The URL a matched response is kept under: where it lives after permanent redirects, cleaned
  // when that is safe, with its existsFn data when existsFn knows it. A response URL that is not
  // http falls back to the fallback URL and the response that served it.
  const adoptResponseUrl = async (
    response: FetchFnResponse,
    requestUrl: string,
    fallback = { url: requestUrl, response },
  ): Promise<CanonicalResult> => {
    const sourceUrl = getFetchedSourceUrl(response, requestUrl)

    if (!sourceUrl) {
      return findCanonicalResult(
        await adoptRewrittenUrl(fallback.url, requestUrl, fallback.response),
      )
    }

    return findCanonicalResult(await adoptRewrittenUrl(sourceUrl, requestUrl, response))
  }

  // An https URL that redirects permanently to http leaves https, so the https form of its target
  // is used when that serves the feed. A target existsFn knows is kept as it is.
  const adoptHttpsTarget = async (
    requestUrl: string,
    targetResult: CanonicalResult,
  ): Promise<CanonicalResult> => {
    const isHttpsToHttp =
      requestUrl.startsWith('https://') && targetResult.url.startsWith('http://')

    if (targetResult.data != null || !isHttpsToHttp) {
      return targetResult
    }

    const httpsTargetUrl = upgradeScheme(targetResult.url)
    const httpsTargetResponse = await fetchAndCompare(httpsTargetUrl)

    if (!httpsTargetResponse || isServedOverHttp(httpsTargetResponse.url)) {
      return targetResult
    }

    if (getFetchedSourceUrl(httpsTargetResponse, httpsTargetUrl) !== httpsTargetUrl) {
      return targetResult
    }

    return findCanonicalResult(createResult(httpsTargetUrl, httpsTargetResponse))
  }

  const adoptInitialResponse = (): Promise<CanonicalResult> => {
    return adoptResponseUrl(initialResponse, initialRequestUrl, {
      url: initialResponseUrlRaw,
      response: initialResponse,
    })
  }

  let initialResult = await adoptInitialResponse()

  if (initialResult.data != null) {
    return initialResult
  }

  // Phase 3: Validate self URLs.
  // Try each self URL, then its alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let candidateSource = initialResult
  const urlsToTry: Array<string> = []

  for (const selfRequestUrl of selfRequestUrls) {
    // A self URL equal to the response URL is already verified, so the ones after it are not tried.
    if (selfRequestUrl === initialResult.url) {
      break
    }

    urlsToTry.push(selfRequestUrl)

    if (selfRequestUrl.startsWith('https://')) {
      urlsToTry.push(upgradeScheme(selfRequestUrl, 'http'))
    } else if (selfRequestUrl.startsWith('http://')) {
      urlsToTry.push(upgradeScheme(selfRequestUrl))
    }
  }

  for (const urlToTry of urlsToTry) {
    const response = await fetchAndCompare(urlToTry)

    if (response) {
      // A self URL whose response lands on a non-http URL is not trusted.
      const selfResult = await adoptResponseUrl(response, urlToTry, initialResult)

      if (selfResult.data != null) {
        return selfResult
      }

      candidateSource = selfResult
      break
    }
  }

  // Phase 4: Apply URL probes.
  // Test alternate URL forms (e.g., WordPress query param -> path conversion).
  const probeResult = await applyProbes(candidateSource.url, probes, async (candidateUrl) => {
    // A probe hands over a string of its own making, so it is parsed like any URL a server sent.
    const probeUrl = parseHttpUrl(candidateUrl)

    if (!probeUrl) {
      return
    }

    const response = await fetchAndCompare(probeUrl)

    if (response) {
      return adoptResponseUrl(response, probeUrl)
    }
  })

  if (probeResult?.data != null) {
    return probeResult
  }

  if (probeResult) {
    candidateSource = probeResult
  }

  // A cleaned response URL trusted without a fetch fails when a self URL or a probe names it and
  // it does not serve the feed. The response is adopted again, which keeps the URL it came from.
  if (hasFailed(initialResult.url)) {
    // A self URL can adopt the same cleaned URL as a result of its own.
    const isCandidateSource = candidateSource.url === initialResult.url

    initialResult = await adoptInitialResponse()

    if (initialResult.data != null) {
      return initialResult
    }

    if (isCandidateSource) {
      candidateSource = initialResult
    }
  }

  const startedUrls: Array<string> = []

  // A target is searched from once, and only while the call has seen no more than maxHops
  // redirects, so a server that names a new URL each time cannot keep the search going. A
  // cleanUrlFn that does so spends no redirect, so the searches are counted too: a redirect
  // gives two targets at most, the cleaned one and the one as sent.
  const isSearchable = (result: CanonicalResult): boolean => {
    if (startedUrls.includes(result.url)) {
      return false
    }

    return hopCount <= maxHops && startedUrls.length <= maxHops * 2
  }

  // Phase 6: Test Candidates (in tier order, first match wins).
  // Returns the first candidate that serves the feed, with its existsFn data when existsFn knows
  // it. A candidate that redirects permanently gives its target, marked as moved.
  const testCandidates = async (
    urls: Iterable<string>,
    source: CanonicalResult,
    { isVerifiedReused = true } = {},
  ): Promise<CandidateTest | undefined> => {
    for (const candidateUrl of urls) {
      // The source was verified when adopted. Reaching it means no earlier tier served the feed,
      // so it wins over every later one.
      if (isVerifiedReused && candidateUrl === source.url) {
        return
      }

      const existingUrl = await findExistingUrl(candidateUrl)

      if (existingUrl) {
        return { result: existingUrl, isMoved: false }
      }

      const candidateResponse = await fetchAndCompare(candidateUrl)

      if (!candidateResponse) {
        continue
      }

      const candidateResponseUrl = getFetchedSourceUrl(candidateResponse, candidateUrl)

      if (!candidateResponseUrl || candidateResponseUrl === candidateUrl) {
        return { result: createResult(candidateUrl, candidateResponse), isMoved: false }
      }

      // A candidate that redirects permanently is not where the feed lives, so the search moves
      // to its target, known or not. A response URL kept because its cleaned form failed
      // verification matches uncleaned. Both were looked up in existsFn when adopted.
      const adoptedResults = isVerifiedReused ? [source, initialResult] : []
      let adoptedResult = adoptedResults.find(({ url }) => {
        return url === cleanUrlFn(candidateResponseUrl) || url === candidateResponseUrl
      })

      if (!adoptedResult) {
        adoptedResult = await findCanonicalResult(
          await adoptRewrittenUrl(candidateResponseUrl, candidateUrl, candidateResponse),
        )
      }

      const targetResult = await adoptHttpsTarget(candidateUrl, adoptedResult)

      // A target that is the source itself was tested already, so the search ends on it.
      if (targetResult.url === source.url) {
        return { result: source, isMoved: false }
      }

      return { result: targetResult, isMoved: targetResult.data == null }
    }
  }

  // Searches from one source: candidate testing, then the HTTPS upgrade. A permanent redirect
  // target the call has not searched from yet is searched in turn, as when the call starts there.
  const searchFrom = async (source: CanonicalResult): Promise<CanonicalResult> => {
    startedUrls.push(source.url)

    // Phase 5: Generate Candidates.
    // Include the source so Phase 7 finds the winning URL's place in the tier order.
    const candidateUrls = new Set(
      tiers
        .map((tier) => {
          // A tier can strip the scheme, and the parser accepts only absolute URLs.
          const normalizedUrl = addMissingScheme(normalizeUrl(source.url, tier))

          return parseAndApplyRewrites(normalizedUrl)
        })
        .filter(isPresent),
    )
    candidateUrls.add(source.url)

    const candidateTest = await testCandidates(candidateUrls, source)

    if (candidateTest?.result.data != null) {
      return candidateTest.result
    }

    if (candidateTest?.isMoved && isSearchable(candidateTest.result)) {
      return searchFrom(candidateTest.result)
    }

    const winningResult = candidateTest?.result ?? source
    const winningUrl = winningResult.url

    // The tiers only remove www. and the trailing slash, and testing stops at the first candidate
    // that serves the feed. A feed stored under a form less clean than the winner is found here,
    // so the caller does not store it twice. A stored form that redirects permanently is kept.
    // The input and earlier search starts were left through a redirect or a self URL, so their
    // forms are asked too, and kept only when served directly, as for any stored URL.
    const leftUrls = [initialRequestUrl, ...startedUrls]

    for (const baseUrl of [...candidateUrls, winningUrl, ...leftUrls]) {
      for (const variantUrl of createUrlVariants(baseUrl)) {
        const existingUrl = await findExistingUrl(variantUrl)

        if (!existingUrl) {
          continue
        }

        const isLeftUrl = !candidateUrls.has(baseUrl) && baseUrl !== winningUrl
        const sourceUrl = getFetchedSourceUrl(existingUrl.response, existingUrl.url)

        if (isLeftUrl && sourceUrl !== existingUrl.url) {
          continue
        }

        return existingUrl
      }
    }

    // Phase 7: HTTPS Upgrade on winning URL.
    if (!winningUrl.startsWith('http://')) {
      return winningResult
    }

    // An https URL replaces an http winner when it serves the feed over https, or existsFn knows
    // it. Results verified earlier are not reused: they hold the response of another request,
    // which says nothing about how the URL itself is served.
    const testHttpsUrl = async (url: string): Promise<CanonicalResult | undefined> => {
      const httpsTest = await testCandidates([url], source, { isVerifiedReused: false })

      if (!httpsTest) {
        return
      }

      let result = httpsTest.result

      if (httpsTest.isMoved && isSearchable(result)) {
        result = await searchFrom(result)
      }

      if (result.data != null) {
        return result
      }

      // A cleaned URL can carry the response of the URL it was cleaned from. Its own response,
      // when the call has one, is the one that says how it is served.
      const response = comparedResponses.get(result.url) ?? result.response

      if (isServedOverHttp(result.url) || isServedOverHttp(response.url)) {
        return
      }

      return result
    }

    const httpsUrl = upgradeScheme(winningUrl)
    const httpsResult = await testHttpsUrl(httpsUrl)

    // The https form of the URL the winner's response ended on, then of the URL its https form's
    // response ended on, is tried next: rewritten and cleaned, then rewritten, then as it is.
    if (!httpsResult) {
      const httpsResponse = comparedResponses.get(httpsUrl)
      const endUrls = [winningResult.response.url]

      if (httpsResponse) {
        endUrls.push(httpsResponse.url)
      }

      for (const endUrl of endUrls) {
        const finalUrl = parseHttpUrl(endUrl)

        if (!finalUrl) {
          continue
        }

        const httpsFinalUrl = upgradeScheme(finalUrl)
        const rewrittenFinalUrl = applyRewrites(httpsFinalUrl, rewrites)

        // Each form is tested alone, most wanted first: one that serves the feed but ends on
        // http must not end the search.
        for (const url of [cleanUrlFn(rewrittenFinalUrl), rewrittenFinalUrl, httpsFinalUrl]) {
          const httpsFinalResult = await testHttpsUrl(url)

          if (httpsFinalResult) {
            return httpsFinalResult
          }
        }
      }

      return winningResult
    }

    // A cleaner candidate that failed over http can still serve the feed over https. A winner
    // that is not a candidate, or whose https form moved, gets no retry.
    if (httpsResult.url !== httpsUrl || !candidateUrls.has(winningUrl)) {
      return httpsResult
    }

    for (const candidateUrl of candidateUrls) {
      if (candidateUrl === winningUrl) {
        break
      }

      const httpsCandidateResult = await testHttpsUrl(upgradeScheme(candidateUrl))

      if (httpsCandidateResult) {
        return httpsCandidateResult
      }
    }

    return httpsResult
  }

  const searchResult = await searchFrom(candidateSource)

  if (!searchResult.uncleanedUrl || !hasFailed(searchResult.url)) {
    return searchResult
  }

  // A cleaned URL trusted without a fetch was fetched later and did not serve the feed, so the
  // URL its response came from is returned.
  return findCanonicalResult(createResult(searchResult.uncleanedUrl, searchResult.response))
}
