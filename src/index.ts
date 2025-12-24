import { defaultPlatforms, defaultStrippedParams, defaultTiers } from './defaults.js'
import type {
  FeedsmithFeed,
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
} from './types.js'
import {
  applyPlatformHandlers,
  feedsmithParser,
  nativeFetch,
  normalizeUrl,
  resolveUrl,
} from './utils.js'

// Overload 1: Default FeedsmithFeed, parser optional.
export function findCanonical<
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
>(
  inputUrl: string,
  options?: Omit<FindCanonicalOptions<FeedsmithFeed, TResponse, TExisting>, 'parser'>,
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

// Implementation uses 'any' for TFeed to avoid variance issues with parser default.
// Type safety is enforced by the overload signatures above.
export async function findCanonical(
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for function overloads.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> {
  const {
    parser = feedsmithParser,
    fetchFn = nativeFetch,
    existsFn,
    tiers = defaultTiers,
    platforms = defaultPlatforms,
    stripQueryParams = defaultStrippedParams,
    onFetch,
    onMatch,
    onExists,
  } = options ?? {}

  // Strip tracking params from URL using normalizeUrl with minimal options.
  const stripParams = (url: string): string => {
    return stripQueryParams?.length
      ? normalizeUrl(url, { stripQueryParams, sortQueryParams: true, stripEmptyQuery: true })
      : url
  }

  // Prepare a URL by resolving protocols, relative paths, and applying platform handlers.
  const resolveAndApplyPlatformHandlers = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)
    return resolved ? applyPlatformHandlers(resolved, platforms) : undefined
  }

  // Phase 1: Initial fetch.
  const initialRequestUrl = resolveAndApplyPlatformHandlers(inputUrl)
  if (!initialRequestUrl) return

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

  const initialResponseUrlRaw = resolveAndApplyPlatformHandlers(initialResponse.url)
  if (!initialResponseUrlRaw) return
  const initialResponseUrl = stripParams(initialResponseUrlRaw)

  const initialResponseBody = initialResponse.body
  if (!initialResponseBody) return

  let initialResponseSignature: string | undefined

  // Phase 2: Extract and normalize self URL.
  let selfRequestUrl: string | undefined

  const initialResponseFeed = parser.parse(initialResponseBody)
  if (!initialResponseFeed) return

  // All onMatch calls receive initialResponseFeed because matched URLs return content
  // equivalent to the initial response (that's the matching criteria). This allows consumers
  // to access parsed feed data without redundant parsing.
  onMatch?.({ url: initialRequestUrl, response: initialResponse, feed: initialResponseFeed })

  const selfRequestUrlRaw = parser.getSelfUrl(initialResponseFeed)

  if (selfRequestUrlRaw) {
    selfRequestUrl = resolveAndApplyPlatformHandlers(selfRequestUrlRaw, initialResponseUrl)
    selfRequestUrl = selfRequestUrl ? stripParams(selfRequestUrl) : undefined
  }

  // Compare initial response against another response using 2-tier matching:
  // 1. Exact body match (fastest)
  // 2. Signature match (semantic equality via parser)
  const compareWithInitialResponse = (comparedResponseBody: string | undefined): boolean => {
    if (!comparedResponseBody) {
      return false
    }

    // Tier 1: Exact body match.
    if (initialResponseBody === comparedResponseBody) {
      return true
    }

    // Tier 2: Signature match via parser (self URLs neutralized for comparison).
    const comparedResponseFeed = parser.parse(comparedResponseBody)

    if (comparedResponseFeed) {
      initialResponseSignature ||= parser.getSignature(initialResponseFeed)
      const comparedResponseSignature = parser.getSignature(comparedResponseFeed)

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
    if (response.status < 200 || response.status >= 300) return
    if (!compareWithInitialResponse(response.body)) return
    return response
  }

  // Phase 3: Validate self URL.
  // Try self URL first, then alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let variantSourceUrl = initialResponseUrl

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
        variantSourceUrl = resolveAndApplyPlatformHandlers(response.url) ?? initialResponseUrl
        variantSourceUrl = stripParams(variantSourceUrl)
        break
      }
    }
  }

  // Phase 4: Generate Variants.
  // Include variantSource for existsFn check, but skip fetch/compare (already verified).
  const variantUrls = new Set(
    tiers
      .map((tier) => resolveAndApplyPlatformHandlers(normalizeUrl(variantSourceUrl, tier)))
      .filter((variantUrl): variantUrl is string => !!variantUrl),
  )
  variantUrls.add(variantSourceUrl)

  // Phase 5: Test Variants (in tier order, first match wins).
  let winningUrl = variantSourceUrl

  for (const variantUrl of variantUrls) {
    // Check if variant exists in database.
    if (existsFn) {
      const data = await existsFn(variantUrl)

      if (data !== undefined) {
        onExists?.({ url: variantUrl, data })
        return variantUrl
      }
    }

    // Skip if same as variantSource (already verified).
    if (variantUrl === variantSourceUrl) {
      continue
    }

    // Use initial response URL if it's the cleanest variant (already verified via initial fetch).
    if (variantUrl === initialResponseUrl) {
      winningUrl = initialResponseUrl
      break
    }

    const variantResponse = await fetchAndCompare(variantUrl)
    if (variantResponse) {
      let variantResponseUrl = resolveAndApplyPlatformHandlers(variantResponse.url)
      if (variantResponseUrl) {
        variantResponseUrl = stripParams(variantResponseUrl)
      }

      // Skip variant if it redirects to a URL we already have as canonical.
      if (variantResponseUrl === variantSourceUrl || variantResponseUrl === initialResponseUrl) {
        continue
      }

      onMatch?.({ url: variantUrl, response: variantResponse, feed: initialResponseFeed })
      winningUrl = variantUrl
      break
    }
  }

  // Phase 6: HTTPS Upgrade on winning URL.
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
