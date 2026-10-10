import {
  addMissingScheme,
  isHttpUrl,
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
  data?: unknown
  response: FetchFnResponse
  feed: unknown
}

const permanentRedirectStatuses = [301, 308]

// The URL to keep using for a response: its final URL, or the URL before its first temporary
// redirect, since a client keeps using the URI it requested through a 302, 303 or 307.
// See: https://www.rfc-editor.org/rfc/rfc9110#section-15.4.
const getSourceUrl = (response: FetchFnResponse): string => {
  const temporaryRedirect = response.redirects?.find((redirect) => {
    return !permanentRedirectStatuses.includes(redirect.status)
  })

  return temporaryRedirect?.url ?? response.url
}

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
    probes,
    onFetch,
    onMatch,
  } = options ?? {}

  // For URLs a person or markup wrote: the input URL and the feed's self link. resolveUrl repairs
  // schemes, resolves relative paths and decodes character references, so a URL that was already
  // fetched goes through parseAndApplyRewrites instead.
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

  // Fetch a URL and report it to onFetch. Returns the response only when it is a 2xx.
  const fetchSuccess = async (url: string): Promise<FetchFnResponse | undefined> => {
    let response: FetchFnResponse

    try {
      response = await fetchFn(url)
    } catch {
      return
    }

    onFetch?.({ url, response })

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

  let initialResponseSignature: string | undefined

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

  // A self link in the Link header takes precedence over one in the feed body. The header is an
  // HTTP field, not markup, so its URL is parsed without decoding character references.
  // See: https://www.w3.org/TR/websub/#discovery.
  const linkHeaderSelfUrl = getLinkHeaderSelfUrl(initialResponse.headers.get('link'))
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
      if (!initialResponseSignature) {
        initialResponseSignature = parser.getSignature(initialResponseFeed, initialBaseUrl)
      }

      const comparedResponseSignature = parser.getSignature(
        comparedResponseFeed,
        comparedResponseUrl,
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

  // Whether a response landed on http, the final URL after every redirect.
  const isServedOverHttp = (finalUrl: string): boolean => {
    return !!parseHttpUrl(finalUrl)?.startsWith('http://')
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

    return parseHttpUrl(getSourceUrl(response))
  }

  // Phases can adopt the same URL again, so each URL is looked up in existsFn once.
  const existingData = new Map<string, unknown>()

  // Fetch URL and compare with initial response. Returns response if match, undefined otherwise.
  const fetchAndCompare = async (url: string): Promise<FetchFnResponse | undefined> => {
    if (comparedResponses.has(url)) {
      return comparedResponses.get(url)
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

    return response
  }

  // Look a URL up in existsFn, including its form under the other protocol. A known form must serve
  // the same feed in this call, unless it is the URL of verifiedResult, which already did.
  // Returns false when the URL itself is known but serves a different feed.
  const findExistingUrl = async (
    url: string,
    verifiedResult?: CanonicalResult,
  ): Promise<CanonicalResult | false | undefined> => {
    if (!existsFn) {
      return
    }

    const lookupUrls = [url]
    let isMismatch = false

    if (url.startsWith('https://')) {
      lookupUrls.push(upgradeScheme(url, 'http'))
    }

    if (url.startsWith('http://')) {
      lookupUrls.push(upgradeScheme(url, 'https'))
    }

    for (const lookupUrl of lookupUrls) {
      if (!existingData.has(lookupUrl)) {
        existingData.set(lookupUrl, await existsFn(lookupUrl))
      }

      const data = existingData.get(lookupUrl)

      if (data == null) {
        continue
      }

      if (!verifiedResult || lookupUrl !== url) {
        const response = await fetchAndCompare(lookupUrl)

        if (!response) {
          if (lookupUrl === url) {
            isMismatch = true
          }

          continue
        }

        const sourceUrl = getFetchedSourceUrl(response, lookupUrl)

        // A candidate that redirects permanently is not where the feed lives, so its target is
        // tested instead, known or not.
        if (lookupUrl === url && sourceUrl && sourceUrl !== url) {
          continue
        }

        reportMatch(lookupUrl, response)

        return { url: lookupUrl, data, response, feed: initialResponseFeed }
      }

      return { ...verifiedResult, data }
    }

    if (isMismatch) {
      return false
    }
  }

  // An adopted result with its existsFn data when existsFn knows its URL.
  const findCanonicalResult = async (result: CanonicalResult): Promise<CanonicalResult> => {
    const existingUrl = await findExistingUrl(result.url, result)

    if (!existingUrl) {
      return result
    }

    return existingUrl
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

    reportMatch(rewrittenUrl, rewrittenResponse)

    return adoptCleanedUrl(rewrittenUrl, rewrittenUrl, rewrittenResponse)
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
    const received = parseUrl(responseUrl)
    const cleaned = parseUrl(cleanedUrl)
    const isSameLocation =
      received?.origin === cleaned?.origin && received?.pathname === cleaned?.pathname
    const hasCleanedUrlFailed =
      comparedResponses.has(cleanedUrl) && !comparedResponses.get(cleanedUrl)

    // A cleaned URL that failed earlier in the call is not trusted, even for a query-only edit.
    if (hasCleanedUrlFailed) {
      return { url: responseUrl, response, feed: initialResponseFeed }
    }

    if (isSameLocation || cleanedUrl === requestUrl) {
      return { url: cleanedUrl, response, feed: initialResponseFeed }
    }

    const cleanedResponse = await fetchAndCompare(cleanedUrl)

    if (!cleanedResponse) {
      return { url: responseUrl, response, feed: initialResponseFeed }
    }

    reportMatch(cleanedUrl, cleanedResponse)

    return { url: cleanedUrl, response: cleanedResponse, feed: initialResponseFeed }
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

  const initialResult = await adoptResponseUrl(initialResponse, initialRequestUrl, {
    url: initialResponseUrlRaw,
    response: initialResponse,
  })

  if (initialResult.data != null) {
    return initialResult
  }

  const initialResponseUrl = initialResult.url

  // Phase 3: Validate self URLs.
  // Try each self URL, then its alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let candidateSource = initialResult
  const urlsToTry: Array<string> = []

  for (const selfRequestUrl of selfRequestUrls) {
    // A self URL equal to the response URL is already verified, so the ones after it are not tried.
    if (selfRequestUrl === initialResponseUrl) {
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
      reportMatch(urlToTry, response)
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
  const probeResult = await applyProbes(candidateSource.url, probes ?? [], async (candidateUrl) => {
    const response = await fetchAndCompare(candidateUrl)

    if (response) {
      reportMatch(candidateUrl, response)
      return adoptResponseUrl(response, candidateUrl)
    }
  })

  if (probeResult?.data != null) {
    return probeResult
  }

  if (probeResult) {
    candidateSource = probeResult
  }

  const candidateSourceUrl = candidateSource.url

  // Phase 5: Generate Candidates.
  // Include candidateSource so Phase 7 finds the winning URL's place in the tier order. Testing
  // skips it, since it was verified and looked up when adopted.
  const candidateUrls = new Set(
    tiers
      .map((tier) => {
        // A tier can strip the scheme, and the parser accepts only absolute URLs.
        const normalizedUrl = addMissingScheme(normalizeUrl(candidateSourceUrl, tier))

        return parseAndApplyRewrites(normalizedUrl)
      })
      .filter((candidateUrl): candidateUrl is string => !!candidateUrl),
  )
  candidateUrls.add(candidateSourceUrl)

  // Phase 6: Test Candidates (in tier order, first match wins).
  // Returns the first candidate that serves the feed, with its existsFn data when existsFn knows
  // it, which ends the search before the HTTPS upgrade.
  const testCandidates = async (urls: Iterable<string>): Promise<CanonicalResult | undefined> => {
    for (const candidateUrl of urls) {
      if (candidateUrl === candidateSourceUrl) {
        continue
      }

      // Use initial response URL if it's the cleanest candidate, verified and looked up in Phase 1.
      if (candidateUrl === initialResponseUrl) {
        return initialResult
      }

      const existingUrl = await findExistingUrl(candidateUrl)

      if (existingUrl) {
        return existingUrl
      }

      if (existingUrl === false) {
        continue
      }

      const candidateResponse = await fetchAndCompare(candidateUrl)

      if (candidateResponse) {
        reportMatch(candidateUrl, candidateResponse)

        const candidateResponseUrl = getFetchedSourceUrl(candidateResponse, candidateUrl)

        if (!candidateResponseUrl || candidateResponseUrl === candidateUrl) {
          return { url: candidateUrl, response: candidateResponse, feed: initialResponseFeed }
        }

        // A candidate that redirects permanently is not where the feed lives, so its target is the
        // result, known or not. A response URL kept because its cleaned form failed verification
        // matches uncleaned. Both were looked up in existsFn when adopted.
        const knownResult = [candidateSource, initialResult].find(({ url }) => {
          return url === cleanUrlFn(candidateResponseUrl) || url === candidateResponseUrl
        })

        if (knownResult) {
          return knownResult
        }

        const targetResult = await adoptRewrittenUrl(
          candidateResponseUrl,
          candidateUrl,
          candidateResponse,
        )

        return findCanonicalResult(targetResult)
      }
    }
  }

  const candidateResult = await testCandidates(candidateUrls)

  if (candidateResult?.data != null) {
    return candidateResult
  }

  const winningResult = candidateResult ?? candidateSource
  const winningUrl = winningResult.url

  // Phase 7: HTTPS Upgrade on winning URL.
  if (!winningUrl.startsWith('http://')) {
    return winningResult
  }

  const httpsUrl = upgradeScheme(winningUrl)
  const httpsResponse = await fetchAndCompare(httpsUrl)

  // An https URL whose response ends on http, through any redirect, is not served over https.
  if (!httpsResponse || isServedOverHttp(httpsResponse.url)) {
    return winningResult
  }

  reportMatch(httpsUrl, httpsResponse)

  // An https URL that redirects permanently is not where the feed lives either, as in Phase 6.
  const sourceUrl = getFetchedSourceUrl(httpsResponse, httpsUrl) ?? httpsUrl
  const targetResult = await adoptRewrittenUrl(sourceUrl, httpsUrl, httpsResponse)

  if (targetResult.url !== httpsUrl) {
    return findCanonicalResult(targetResult)
  }

  // A cleaner candidate that failed over http can still serve the feed over https. A redirect
  // target that won Phase 6 is not a candidate, so it gets no retry. Phase 6 looked up both
  // protocol forms of the winning URL, so httpsUrl is not looked up again.
  if (!candidateUrls.has(winningUrl)) {
    return targetResult
  }

  const httpsCandidateUrls: Array<string> = []

  for (const candidateUrl of candidateUrls) {
    if (candidateUrl === winningUrl) {
      break
    }

    httpsCandidateUrls.push(upgradeScheme(candidateUrl))
  }

  const httpsCandidateResult = await testCandidates(httpsCandidateUrls)

  if (!httpsCandidateResult) {
    return targetResult
  }

  // An https candidate whose response ends on http is not served over https either.
  if (isServedOverHttp(httpsCandidateResult.response?.url ?? httpsCandidateResult.url)) {
    return targetResult
  }

  return httpsCandidateResult
}
