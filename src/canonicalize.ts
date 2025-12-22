import { defaultPlatforms, defaultTiers } from './defaults.js'
import type { CanonicalizeOptions, FetchFnResponse, ParserAdapter } from './types.js'
import {
  applyPlatformHandlers,
  feedsmithParser,
  md5Hash,
  nativeFetch,
  normalizeUrl,
  resolveUrl,
} from './utils.js'

export const canonicalize = async <TFeed, TExisting>(
  inputUrl: string,
  options?: CanonicalizeOptions<TFeed, TExisting>,
): Promise<string | undefined> => {
  const {
    fetchFn = nativeFetch,
    hashFn = md5Hash,
    existsFn,
    parser = feedsmithParser as unknown as ParserAdapter<TFeed>,
    tiers = defaultTiers,
    platforms = defaultPlatforms,
    onFetch,
    onMatch,
    onExists,
    onComplete,
  } = options ?? {}

  let fetchCount = 0
  const matchedUrls: Array<string> = []

  // Prepare a URL by resolving protocols, relative paths, and applying platform handlers.
  const prepareUrl = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)
    return resolved ? applyPlatformHandlers(resolved, platforms) : undefined
  }

  // Phase 1: Initial Fetch.
  const initialRequestUrl = prepareUrl(inputUrl)
  if (!initialRequestUrl) {
    onComplete?.({ canonical: undefined, inputUrl, feed: undefined, fetchCount, matchedUrls })
    return
  }

  let initialResponse: FetchFnResponse

  try {
    initialResponse = await fetchFn(initialRequestUrl)
    fetchCount++
  } catch {
    onComplete?.({ canonical: undefined, inputUrl, feed: undefined, fetchCount, matchedUrls })
    return
  }

  onFetch?.({ url: initialRequestUrl, response: initialResponse, purpose: 'initial' })

  if (initialResponse.status < 200 || initialResponse.status >= 300) {
    onComplete?.({ canonical: undefined, inputUrl, feed: undefined, fetchCount, matchedUrls })
    return
  }

  const initialResponseUrl = prepareUrl(initialResponse.url)
  if (!initialResponseUrl) {
    onComplete?.({ canonical: undefined, inputUrl, feed: undefined, fetchCount, matchedUrls })
    return
  }

  const initialResponseBody = initialResponse.body
  let initialResponseHash: string | undefined
  let initialResponseSignature: string | undefined

  // Phase 2: Extract and normalize self URL.
  let selfRequestUrl: string | undefined
  const initialResponseFeed = parser.parse(initialResponseBody)

  if (!initialResponseFeed) {
    onComplete?.({ canonical: undefined, inputUrl, feed: undefined, fetchCount, matchedUrls })
    return
  }

  // All onMatch calls receive initialResponseFeed because matched URLs return content
  // equivalent to the initial response (that's the matching criteria). This allows consumers
  // to access parsed feed data without redundant parsing.
  matchedUrls.push(initialRequestUrl)
  onMatch?.({
    url: initialRequestUrl,
    response: initialResponse,
    feed: initialResponseFeed,
    matchType: 'initial',
  })

  const selfRequestUrlRaw = parser.getSelfUrl(initialResponseFeed)

  if (selfRequestUrlRaw) {
    selfRequestUrl = prepareUrl(selfRequestUrlRaw, initialResponseUrl)
  }

  // Compare initial response against another response using 3-tier matching:
  // 1. Exact body match (fastest)
  // 2. Hash match (content equality, lazy evaluates initialResponseHash)
  // 3. Signature match (semantic equality via parser)
  const compareWithInitialResponse = (comparedResponseBody: string | undefined): boolean => {
    if (!initialResponseBody || !comparedResponseBody) {
      return false
    }

    // Tier 1: exact body match.
    if (initialResponseBody === comparedResponseBody) {
      return true
    }

    // Tier 2: hash match (lazy evaluate initialResponseHash).
    initialResponseHash ||= hashFn(initialResponseBody)
    if (initialResponseHash === hashFn(comparedResponseBody)) {
      return true
    }

    // Tier 3: signature match (only if parser is available).
    if (initialResponseFeed) {
      const comparedResponseFeed = parser.parse(comparedResponseBody)

      if (comparedResponseFeed) {
        initialResponseSignature ||= JSON.stringify(parser.getSignature(initialResponseFeed))
        const comparedResponseSignature = JSON.stringify(parser.getSignature(comparedResponseFeed))

        return initialResponseSignature === comparedResponseSignature
      }
    }

    return false
  }

  // Fetch URL and compare with initial response. Returns response if match, undefined otherwise.
  const fetchAndCompare = async (
    url: string,
    purpose: 'selfUrl' | 'selfUrlFallback' | 'variant' | 'httpsUpgrade',
  ): Promise<FetchFnResponse | undefined> => {
    let response: FetchFnResponse
    try {
      response = await fetchFn(url)
      fetchCount++
    } catch {
      return
    }
    onFetch?.({ url, response, purpose })
    if (response.status < 200 || response.status >= 300) return
    if (!compareWithInitialResponse(response.body)) return
    return response
  }

  // Phase 3: Validate self URL.
  // Try self URL first, then alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let variantSource = initialResponseUrl

  if (selfRequestUrl && selfRequestUrl !== initialResponseUrl && initialResponseBody) {
    // Build list of URLs to try (self URL first, then alternate protocol).
    const urlsToTry = [selfRequestUrl]

    if (selfRequestUrl.startsWith('https://')) {
      urlsToTry.push(selfRequestUrl.replace('https://', 'http://'))
    } else if (selfRequestUrl.startsWith('http://')) {
      urlsToTry.push(selfRequestUrl.replace('http://', 'https://'))
    }

    for (let i = 0; i < urlsToTry.length; i++) {
      const urlToTry = urlsToTry[i]
      const purpose = i === 0 ? 'selfUrl' : 'selfUrlFallback'
      const response = await fetchAndCompare(urlToTry, purpose)

      if (response) {
        matchedUrls.push(urlToTry)
        onMatch?.({ url: urlToTry, response, feed: initialResponseFeed, matchType: 'selfUrl' })
        variantSource = prepareUrl(response.url) ?? initialResponseUrl
        break
      }
    }
  }

  // Phase 4: Generate Variants.
  const variants = new Set(
    tiers
      .map((tier) => prepareUrl(normalizeUrl(variantSource, tier)))
      .filter((url): url is string => url !== undefined),
  )
  variants.add(variantSource)

  // Phase 5: Test Variants (in tier order, first match wins).
  let winningUrl = variantSource

  for (const variant of variants) {
    // Check if variant exists in database.
    if (existsFn) {
      const data = await existsFn(variant)

      if (data !== undefined) {
        onExists?.({ url: variant, data })
        onComplete?.({
          canonical: variant,
          inputUrl,
          feed: initialResponseFeed,
          fetchCount,
          matchedUrls,
        })
        return variant
      }
    }

    // Skip if same as variantSource (already verified).
    if (variant === variantSource) {
      continue
    }

    // Skip if same as initial response URL (already known to work).
    if (variant === initialResponseUrl) {
      winningUrl = initialResponseUrl
      break
    }

    const response = await fetchAndCompare(variant, 'variant')
    if (response) {
      const preparedResponseUrl = prepareUrl(response.url)

      // Skip variant if it redirects to a URL we already have as canonical.
      if (preparedResponseUrl === variantSource || preparedResponseUrl === initialResponseUrl) {
        continue
      }

      matchedUrls.push(variant)
      onMatch?.({ url: variant, response, feed: initialResponseFeed, matchType: 'variant' })
      winningUrl = variant
      break
    }
  }

  // Phase 6: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = winningUrl.replace('http://', 'https://')
    const response = await fetchAndCompare(httpsUrl, 'httpsUpgrade')

    if (response) {
      matchedUrls.push(httpsUrl)
      onMatch?.({ url: httpsUrl, response, feed: initialResponseFeed, matchType: 'httpsUpgrade' })
      onComplete?.({
        canonical: httpsUrl,
        inputUrl,
        feed: initialResponseFeed,
        fetchCount,
        matchedUrls,
      })
      return httpsUrl
    }
  }

  onComplete?.({
    canonical: winningUrl,
    inputUrl,
    feed: initialResponseFeed,
    fetchCount,
    matchedUrls,
  })
  return winningUrl
}
