import { defaultPlatforms, defaultTiers } from './defaults.js'
import type { CanonicalizeOptions, FetchFnResponse } from './types.js'
import {
  applyPlatformHandlers,
  createMd5Hash,
  defaultFetchFn,
  normalizeUrl,
  resolveUrl,
} from './utils.js'

export const canonicalize = async <T>(
  inputUrl: string,
  options?: CanonicalizeOptions<T>,
): Promise<string | undefined> => {
  const {
    fetchFn = defaultFetchFn,
    hashFn = createMd5Hash,
    existsFn,
    parser,
    tiers = defaultTiers,
    platforms = defaultPlatforms,
  } = options ?? {}

  // Prepare a URL by resolving protocols, relative paths, and applying platform handlers.
  const prepareUrl = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)
    return resolved ? applyPlatformHandlers(resolved, platforms) : undefined
  }

  // Phase 1: Initial Fetch.
  const initialRequestUrl = prepareUrl(inputUrl)
  if (!initialRequestUrl) return

  let initialResponse: FetchFnResponse

  try {
    initialResponse = await fetchFn(initialRequestUrl)
  } catch {
    return
  }

  if (initialResponse.status < 200 || initialResponse.status >= 300) {
    return
  }

  const initialResponseUrl = prepareUrl(initialResponse.url)
  if (!initialResponseUrl) return

  const initialResponseBody = initialResponse.body
  let initialResponseHash: string | undefined
  let initialResponseSignature: string | undefined

  // Phase 2: Extract and normalize self URL.
  let selfRequestUrl: string | undefined
  let initialResponseFeed: T | undefined

  if (parser) {
    try {
      initialResponseFeed = parser.parse(initialResponseBody)
    } catch {
      // Invalid feed content (empty, malformed, etc.).
      return
    }

    if (initialResponseFeed) {
      const rawSelfUrl = parser.getSelfUrl(initialResponseFeed)

      if (rawSelfUrl) {
        selfRequestUrl = prepareUrl(rawSelfUrl, initialResponseUrl)
      }
    }
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
    if (parser && initialResponseFeed) {
      try {
        const comparedResponseFeed = parser.parse(comparedResponseBody)

        if (comparedResponseFeed) {
          initialResponseSignature ||= JSON.stringify(parser.getSignature(initialResponseFeed))
          const comparedResponseSignature = JSON.stringify(
            parser.getSignature(comparedResponseFeed),
          )

          return initialResponseSignature === comparedResponseSignature
        }
      } catch {}
    }

    return false
  }

  // Fetch URL and compare with initial response. Returns response URL if match, undefined otherwise.
  const fetchAndCompare = async (url: string): Promise<string | undefined> => {
    try {
      const response = await fetchFn(url)
      if (response.status < 200 || response.status >= 300) return
      if (!compareWithInitialResponse(response.body)) return
      return response.url
    } catch {}
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

    for (const urlToTry of urlsToTry) {
      const responseUrl = await fetchAndCompare(urlToTry)

      if (responseUrl) {
        variantSource = prepareUrl(responseUrl) ?? initialResponseUrl
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
      const exists = await existsFn(variant)

      if (exists) {
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

    if (await fetchAndCompare(variant)) {
      winningUrl = variant
      break
    }
  }

  // Phase 6: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = winningUrl.replace('http://', 'https://')

    if (await fetchAndCompare(httpsUrl)) {
      return httpsUrl
    }
  }

  return winningUrl
}
