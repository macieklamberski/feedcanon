import { defaultPlatforms, defaultTiers } from './defaults.js'
import type { CanonicalizeOptions, ParserAdapter } from './types.js'
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

  // Compare two responses using 3-tier matching:
  // 1. Exact body match (fastest)
  // 2. Hash match (content equality, lazy evaluates initialResponseHash)
  // 3. Signature match (semantic equality via parser)
  const compareResponses = (
    body1: string | undefined,
    feed1: T | undefined,
    body2: string | undefined,
    parserAdapter: ParserAdapter<T> | undefined,
  ): boolean => {
    if (!body1 || !body2) {
      return false
    }

    // Tier 1: exact body match.
    if (body1 === body2) {
      return true
    }

    // Tier 2: hash match (lazy evaluate hash1).
    initialResponseHash ||= hashFn(body1)
    if (initialResponseHash === hashFn(body2)) {
      return true
    }

    // Tier 3: signature match (only if parser is available).
    if (parserAdapter && feed1) {
      try {
        const feed2 = parserAdapter.parse(body2)

        if (feed2) {
          const sig1 = JSON.stringify(parserAdapter.getSignature(feed1))
          const sig2 = JSON.stringify(parserAdapter.getSignature(feed2))
          return sig1 === sig2
        }
      } catch {
        // Parsing failed, signatures don't match.
      }
    }

    return false
  }

  // Phase 1: Initial Fetch.
  const initialRequestUrl = prepareUrl(inputUrl)
  if (!initialRequestUrl) return

  let initialResponse: Awaited<ReturnType<typeof fetchFn>>

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
      try {
        const selfResponse = await fetchFn(urlToTry)

        if (selfResponse.status >= 200 && selfResponse.status < 300) {
          const isMatch = compareResponses(
            initialResponseBody,
            initialResponseFeed,
            selfResponse.body,
            parser,
          )

          if (isMatch) {
            // URL is valid - use destination URL (after redirects) as source for variants.
            variantSource = prepareUrl(selfResponse.url) ?? initialResponseUrl
            break
          }
        }
      } catch {
        // This URL failed, try next.
      }
    }
  } else if (selfRequestUrl === initialResponseUrl) {
    // Self URL matches initial response URL, use it.
    variantSource = initialResponseUrl
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

    try {
      const variantResponse = await fetchFn(variant)

      if (variantResponse.status < 200 || variantResponse.status >= 300) {
        continue
      }

      const isMatch = compareResponses(
        initialResponseBody,
        initialResponseFeed,
        variantResponse.body,
        parser,
      )

      if (isMatch) {
        winningUrl = variant
        break
      }
    } catch {
      // Variant fetch failed, try next.
    }
  }

  // Phase 6: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = prepareUrl(winningUrl.replace('http://', 'https://'))

    if (httpsUrl) {
      try {
        const httpsResponse = await fetchFn(httpsUrl)

        if (httpsResponse.status >= 200 && httpsResponse.status < 300) {
          const isMatch = compareResponses(
            initialResponseBody,
            initialResponseFeed,
            httpsResponse.body,
            parser,
          )

          if (isMatch) {
            return httpsUrl
          }
        }
      } catch {
        // HTTPS upgrade failed.
      }
    }
  }

  return winningUrl
}
