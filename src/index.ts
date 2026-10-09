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
// enforced by the overload signatures above. An error thrown by any injected callback resolves to
// undefined, like any other failure.
export async function findCanonical(
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for function overloads.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> {
  try {
    return await resolveCanonical(inputUrl, options)
  } catch {}
}

const resolveCanonical = async (
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Same as the findCanonical implementation.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> => {
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
    onExists,
  } = options ?? {}

  const tidyQuery = (url: string): string => {
    return normalizeUrl(url, { sortQueryParams: true, stripEmptyQuery: true })
  }

  // Prepare a URL by resolving protocols, relative paths, and applying rewrites.
  const resolveAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)

    if (!resolved) {
      return
    }

    return applyRewrites(resolved, rewrites)
  }

  // A response or redirect URL is already final, and resolveUrl would decode character references
  // in it, turning `/a&amp;b` into a URL that was never fetched.
  const parseAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const parsed = parseUrl(url, baseUrl)

    if (!parsed || !isHttpUrl(parsed)) {
      return
    }

    return applyRewrites(parsed.href, rewrites)
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

    if (httpRequestUrl) {
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

  const initialResponseUrlRaw = parseAndApplyRewrites(initialResponse.url)
  if (!initialResponseUrlRaw) {
    return
  }
  // The URL that served the initial body. Self URLs resolve against it, and its signature uses it,
  // as a compared response's signature uses the URL that served that body.
  const initialBaseUrl = tidyQuery(initialResponseUrlRaw)

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

  // All onMatch calls receive initialResponseFeed because matched URLs return content equivalent to
  // the initial response (that's the matching criteria). This allows consumers to access parsed
  // feed data without redundant parsing.
  onMatch?.({ url: initialRequestUrl, response: initialResponse, feed: initialResponseFeed })

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

    if (comparedResponseFeed) {
      if (!initialResponseSignature) {
        initialResponseSignature = parser.getSignature(initialResponseFeed, initialBaseUrl)
      }

      const comparedResponseSignature = parser.getSignature(
        comparedResponseFeed,
        comparedResponseUrl,
      )

      return initialResponseSignature === comparedResponseSignature
    }

    return false
  }

  // Phases can try the same URL again, so each URL is fetched once and its result reused.
  const comparedResponses = new Map<string, FetchFnResponse | undefined>([
    [initialRequestUrl, initialResponse],
  ])

  // An https form that failed in Phase 1 fails again when Phase 7 upgrades the http fallback.
  if (initialRequestUrl !== initialRequestUrls[0]) {
    comparedResponses.set(initialRequestUrls[0], undefined)
  }

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

  // A cleaner that only edits the query is trusted. One that moves the URL to another origin or
  // path (an unwrapped redirect link) names a URL nobody fetched, so it is used only once known to
  // existsFn or verified to serve the same feed. Otherwise the response URL is kept.
  const adoptCleanedUrl = async (responseUrl: string, requestUrl: string): Promise<string> => {
    const cleanedUrl = cleanUrlFn(responseUrl)
    const received = parseUrl(responseUrl)
    const cleaned = parseUrl(cleanedUrl)
    const isSameLocation =
      received?.origin === cleaned?.origin && received?.pathname === cleaned?.pathname

    if (isSameLocation || cleanedUrl === requestUrl) {
      return cleanedUrl
    }

    if (existsFn && (await existsFn(cleanedUrl)) != null) {
      return cleanedUrl
    }

    const response = await fetchAndCompare(cleanedUrl)

    if (!response) {
      return responseUrl
    }

    onMatch?.({ url: cleanedUrl, response, feed: initialResponseFeed })

    return cleanedUrl
  }

  // The URL a matched response is kept under: where it lives after permanent redirects, cleaned
  // when that is safe. A response URL that is not http falls back to fallbackUrl.
  const adoptSourceUrl = (
    response: FetchFnResponse,
    requestUrl: string,
    fallbackUrl = requestUrl,
  ): Promise<string> => {
    const sourceUrl = parseAndApplyRewrites(getSourceUrl(response)) ?? fallbackUrl

    return adoptCleanedUrl(sourceUrl, requestUrl)
  }

  const initialResponseUrl = await adoptSourceUrl(
    initialResponse,
    initialRequestUrl,
    initialResponseUrlRaw,
  )

  // Phase 3: Validate self URLs.
  // Try each self URL, then its alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let candidateSourceUrl = initialResponseUrl
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
      onMatch?.({ url: urlToTry, response, feed: initialResponseFeed })
      // A self URL whose response lands on a non-http URL is not trusted.
      candidateSourceUrl = await adoptSourceUrl(response, urlToTry, initialResponseUrl)
      break
    }
  }

  // Phase 4: Apply URL probes.
  // Test alternate URL forms (e.g., WordPress query param -> path conversion).
  if (probes?.length) {
    candidateSourceUrl = await applyProbes(candidateSourceUrl, probes, async (candidateUrl) => {
      const response = await fetchAndCompare(candidateUrl)

      if (response) {
        onMatch?.({ url: candidateUrl, response, feed: initialResponseFeed })
        return adoptSourceUrl(response, candidateUrl)
      }
    })
  }

  // Phase 5: Generate Candidates.
  // Include candidateSource for existsFn check, but skip fetch/compare (already verified).
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
  let winningUrl = candidateSourceUrl
  const hasSourceQuery = !!parseUrl(candidateSourceUrl)?.search

  // Look a URL up in existsFn, including its form under the other protocol. Returns the known URL,
  // or false when the URL itself is known but serves a different feed.
  const findExistingUrl = async (url: string): Promise<string | false | undefined> => {
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
      const data = await existsFn(lookupUrl)

      if (data == null) {
        continue
      }

      // A query can select a different feed, so a known URL without it must serve the same feed.
      const isQueryStripped =
        hasSourceQuery && !parseUrl(lookupUrl)?.search && lookupUrl !== initialResponseUrl

      if (isQueryStripped) {
        const response = await fetchAndCompare(lookupUrl)

        if (!response) {
          if (lookupUrl === url) {
            isMismatch = true
          }

          continue
        }

        onMatch?.({ url: lookupUrl, response, feed: initialResponseFeed })
      }

      onExists?.({ url: lookupUrl, data })
      return lookupUrl
    }

    if (isMismatch) {
      return false
    }
  }

  for (const candidateUrl of candidateUrls) {
    const existingUrl = await findExistingUrl(candidateUrl)

    if (existingUrl) {
      return existingUrl
    }

    if (existingUrl === false) {
      continue
    }

    // Skip if same as candidateSource (already verified).
    if (candidateUrl === candidateSourceUrl) {
      continue
    }

    // Use initial response URL if it's the cleanest candidate (already verified via initial fetch).
    if (candidateUrl === initialResponseUrl) {
      winningUrl = initialResponseUrl
      break
    }

    const candidateResponse = await fetchAndCompare(candidateUrl)
    if (candidateResponse) {
      onMatch?.({ url: candidateUrl, response: candidateResponse, feed: initialResponseFeed })

      const candidateResponseUrl = parseAndApplyRewrites(getSourceUrl(candidateResponse))

      if (!candidateResponseUrl || candidateResponseUrl === candidateUrl) {
        winningUrl = candidateUrl
        break
      }

      // A candidate that redirects permanently is not where the feed lives, so its target is the
      // result, known or not. A response URL kept because its cleaned form failed verification
      // matches uncleaned.
      const knownUrl = [candidateSourceUrl, initialResponseUrl].find((url) => {
        return url === cleanUrlFn(candidateResponseUrl) || url === candidateResponseUrl
      })

      winningUrl = knownUrl ?? (await adoptCleanedUrl(candidateResponseUrl, candidateUrl))

      // The loop stops before the target is looked up as a candidate, so look it up here.
      const existingWinningUrl = await findExistingUrl(winningUrl)

      if (existingWinningUrl) {
        return existingWinningUrl
      }

      break
    }
  }

  // Phase 7: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = upgradeScheme(winningUrl)
    const response = await fetchAndCompare(httpsUrl)

    // An https URL that redirects back to http is not served over https.
    if (response && !parseAndApplyRewrites(response.url)?.startsWith('http://')) {
      onMatch?.({ url: httpsUrl, response, feed: initialResponseFeed })

      // An https URL that redirects permanently is not where the feed lives either, as in Phase 6.
      const targetUrl = await adoptSourceUrl(response, httpsUrl)

      if (targetUrl === httpsUrl) {
        return httpsUrl
      }

      const existingTargetUrl = await findExistingUrl(targetUrl)

      if (existingTargetUrl) {
        return existingTargetUrl
      }

      return targetUrl
    }
  }

  return winningUrl
}
