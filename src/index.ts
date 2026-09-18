import { parseUrl } from 'trousse'
import { defaultFetch, defaultParser, defaultTiers } from './defaults.js'
import type {
  DefaultParserResult,
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
} from './types.js'
import { applyProbes, applyRewrites, normalizeUrl, resolveUrl } from './utils.js'

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
// enforced by the overload signatures above.
export async function findCanonical(
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for function overloads.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> {
  const {
    parser = defaultParser,
    fetchFn = defaultFetch,
    cleanUrlFn,
    existsFn,
    tiers = defaultTiers,
    rewrites,
    probes,
    onFetch,
    onMatch,
    onExists,
  } = options ?? {}

  const tidyQuery = (url: string): string => {
    return normalizeUrl(url, { sortQueryParams: true, stripEmptyQuery: true })
  }

  // Clean the URL with the injected function (when given), then tidy the remaining query.
  const stripParams = (url: string): string => {
    return tidyQuery(cleanUrlFn ? cleanUrlFn(url) : url)
  }

  // Prepare a URL by resolving protocols, relative paths, and applying rewrites.
  const resolveAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)
    return resolved && rewrites ? applyRewrites(resolved, rewrites) : resolved
  }

  // Phase 1: Initial fetch.
  const initialRequestUrl = resolveAndApplyRewrites(inputUrl)
  if (!initialRequestUrl) {
    return
  }

  let initialResponse: FetchFnResponse

  try {
    initialResponse = await fetchFn(initialRequestUrl)
  } catch {
    return
  }

  onFetch?.({ url: initialRequestUrl, response: initialResponse })

  if (initialResponse.status < 200 || initialResponse.status >= 300) {
    return
  }

  const initialResponseUrlRaw = resolveAndApplyRewrites(initialResponse.url)
  if (!initialResponseUrlRaw) {
    return
  }
  let initialResponseUrl = tidyQuery(initialResponseUrlRaw)

  const initialResponseBody = initialResponse.body
  if (!initialResponseBody) {
    return
  }

  let initialResponseSignature: string | undefined

  // Phase 2: Extract and normalize self URL.
  let selfRequestUrl: string | undefined

  const initialResponseFeed = await parser.parse(initialResponseBody)
  if (!initialResponseFeed) {
    return
  }

  // All onMatch calls receive initialResponseFeed because matched URLs return content equivalent to
  // the initial response (that's the matching criteria). This allows consumers to access parsed
  // feed data without redundant parsing.
  onMatch?.({ url: initialRequestUrl, response: initialResponse, feed: initialResponseFeed })

  const selfRequestUrlRaw = parser.getSelfUrl(initialResponseFeed)

  if (selfRequestUrlRaw) {
    selfRequestUrl = resolveAndApplyRewrites(selfRequestUrlRaw, initialResponseUrl)
    selfRequestUrl = selfRequestUrl ? stripParams(selfRequestUrl) : undefined
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
    const comparedResponseFeed = await parser.parse(comparedResponseBody)

    if (comparedResponseFeed) {
      initialResponseSignature ||= parser.getSignature(initialResponseFeed, initialResponseUrl)
      const comparedResponseSignature = parser.getSignature(
        comparedResponseFeed,
        comparedResponseUrl,
      )

      return initialResponseSignature === comparedResponseSignature
    }

    return false
  }

  // Fetch URL and compare with initial response. Returns response if match, undefined otherwise.
  const fetchAndCompare = async (url: string): Promise<FetchFnResponse | undefined> => {
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

    if (!(await compareWithInitialResponse(response.body, response.url))) {
      return
    }

    return response
  }

  // A cleaner that only edits the query is trusted. One that moves the URL to another origin or
  // path (an unwrapped redirect link) names a URL nobody fetched, so it is used only once known to
  // existsFn or verified to serve the same feed. Otherwise the response URL is kept.
  const adoptCleanedUrl = async (responseUrl: string, requestUrl: string): Promise<string> => {
    const tidiedUrl = tidyQuery(responseUrl)
    const cleanedUrl = stripParams(responseUrl)
    const tidied = parseUrl(tidiedUrl)
    const cleaned = parseUrl(cleanedUrl)
    const isSameLocation =
      tidied?.origin === cleaned?.origin && tidied?.pathname === cleaned?.pathname

    if (isSameLocation || cleanedUrl === tidyQuery(requestUrl)) {
      return cleanedUrl
    }

    if (existsFn && (await existsFn(cleanedUrl)) !== undefined) {
      return cleanedUrl
    }

    const response = await fetchAndCompare(cleanedUrl)

    if (!response) {
      return tidiedUrl
    }

    onMatch?.({ url: cleanedUrl, response, feed: initialResponseFeed })

    return cleanedUrl
  }

  initialResponseUrl = await adoptCleanedUrl(initialResponseUrlRaw, initialRequestUrl)

  // Phase 3: Validate self URL.
  // Try self URL first, then alternate protocol if it fails (e.g., feed:// resolved to https:// but
  // only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let candidateSourceUrl = initialResponseUrl

  if (selfRequestUrl && selfRequestUrl !== initialResponseUrl) {
    // Build list of URLs to try (self URL first, then alternate protocol).
    const urlsToTry = [selfRequestUrl]

    if (selfRequestUrl.startsWith('https://')) {
      urlsToTry.push(selfRequestUrl.replace('https://', 'http://'))
    } else if (selfRequestUrl.startsWith('http://')) {
      urlsToTry.push(selfRequestUrl.replace('http://', 'https://'))
    }

    for (const urlToTry of urlsToTry) {
      const response = await fetchAndCompare(urlToTry)

      if (response) {
        onMatch?.({ url: urlToTry, response, feed: initialResponseFeed })
        candidateSourceUrl = await adoptCleanedUrl(
          resolveAndApplyRewrites(response.url) ?? initialResponseUrl,
          urlToTry,
        )
        break
      }
    }
  }

  // Phase 4: Apply URL probes.
  // Test alternate URL forms (e.g., WordPress query param -> path conversion).
  if (probes && probes?.length > 0) {
    candidateSourceUrl = await applyProbes(candidateSourceUrl, probes, async (candidateUrl) => {
      const response = await fetchAndCompare(candidateUrl)

      if (response) {
        onMatch?.({ url: candidateUrl, response, feed: initialResponseFeed })
        return adoptCleanedUrl(resolveAndApplyRewrites(response.url) ?? candidateUrl, candidateUrl)
      }
    })
  }

  // Phase 5: Generate Candidates.
  // Include candidateSource for existsFn check, but skip fetch/compare (already verified).
  const candidateUrls = new Set(
    tiers
      .map((tier) => resolveAndApplyRewrites(normalizeUrl(candidateSourceUrl, tier)))
      .filter((candidateUrl): candidateUrl is string => !!candidateUrl),
  )
  candidateUrls.add(candidateSourceUrl)

  // Phase 6: Test Candidates (in tier order, first match wins).
  let winningUrl = candidateSourceUrl

  for (const candidateUrl of candidateUrls) {
    // Check if candidate exists in database.
    if (existsFn) {
      const data = await existsFn(candidateUrl)

      if (data !== undefined) {
        onExists?.({ url: candidateUrl, data })
        return candidateUrl
      }
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
      const candidateResponseUrl = resolveAndApplyRewrites(candidateResponse.url)

      // Skip candidate if it redirects to a URL we already have as canonical. A response URL kept
      // because its cleaned form failed verification matches only in its uncleaned form.
      if (candidateResponseUrl) {
        const knownUrls = [candidateSourceUrl, initialResponseUrl]
        const isKnownUrl =
          knownUrls.includes(stripParams(candidateResponseUrl)) ||
          knownUrls.includes(tidyQuery(candidateResponseUrl))

        if (isKnownUrl) {
          continue
        }
      }

      onMatch?.({ url: candidateUrl, response: candidateResponse, feed: initialResponseFeed })
      winningUrl = candidateUrl
      break
    }
  }

  // Phase 7: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = winningUrl.replace('http://', 'https://')
    const response = await fetchAndCompare(httpsUrl)

    if (response) {
      onMatch?.({ url: httpsUrl, response, feed: initialResponseFeed })
      return httpsUrl
    }
  }

  return winningUrl
}
