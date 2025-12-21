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
    verifyUrlFn,
    hashFn = createMd5Hash,
    existsFn,
    parser,
    tiers = defaultTiers,
    platforms = defaultPlatforms,
  } = options ?? {}

  // Helper to prepare a URL by resolving protocols, relative paths, applying platform handlers, and verifying.
  const prepareUrl = async (url: string, baseUrl?: string): Promise<string | undefined> => {
    const resolved = resolveUrl(url, baseUrl)
    if (!resolved) return undefined

    const platformized = applyPlatformHandlers(resolved, platforms)

    if (verifyUrlFn) {
      const isVerified = await verifyUrlFn(platformized)
      if (!isVerified) return undefined
    }

    return platformized
  }

  // Helper to compare two responses using content hash first, then signature hash as fallback.
  // Returns true if the responses represent the same feed content.
  const compareResponses = async (
    body1: string | undefined,
    hash1: string | undefined,
    parsed1: T | undefined,
    body2: string | undefined,
    parserAdapter: ParserAdapter<T> | undefined,
  ): Promise<boolean> => {
    // Fast path: content hash match.
    const hash2 = body2 ? await hashFn(body2) : undefined
    if (hash1 && hash2 && hash1 === hash2) {
      return true
    }

    // Slow path: signature hash match (only if parser is available).
    if (parserAdapter && parsed1 && body2) {
      try {
        const parsed2 = parserAdapter.parse(body2)
        if (parsed2) {
          const sig1 = JSON.stringify(parserAdapter.getSignature(parsed1))
          const sig2 = JSON.stringify(parserAdapter.getSignature(parsed2))
          const sigHash1 = await hashFn(sig1)
          const sigHash2 = await hashFn(sig2)
          return sigHash1 === sigHash2
        }
      } catch {
        // Parsing failed, signatures don't match.
      }
    }

    return false
  }

  // Phase 1: Initial Fetch.
  const initialRequestUrl = await prepareUrl(inputUrl)
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

  const initialResponseUrl = await prepareUrl(initialResponse.url)
  if (!initialResponseUrl) return

  const initialResponseBody = initialResponse.body
  const initialResponseHash = initialResponseBody ? await hashFn(initialResponseBody) : undefined

  // Phase 2: Extract and normalize self URL.
  let selfRequestUrl: string | undefined
  let initialParsed: T | undefined

  if (parser) {
    try {
      initialParsed = parser.parse(initialResponseBody)
    } catch {
      // Invalid feed content (empty, malformed, etc.).
      return
    }

    if (initialParsed) {
      const rawSelfUrl = parser.getSelfUrl(initialParsed)

      if (rawSelfUrl) {
        selfRequestUrl = await prepareUrl(rawSelfUrl, initialResponseUrl)
      }
    }
  }

  // Phase 3: Validate self URL.
  // Try self URL first, then alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid self URL due to protocol mismatch.
  let variantSource = initialResponseUrl

  if (selfRequestUrl && selfRequestUrl !== initialResponseUrl && initialResponseHash) {
    // Build list of URLs to try (self URL first, then alternate protocol).
    const urlsToTry = [selfRequestUrl]

    if (selfRequestUrl.startsWith('https://')) {
      urlsToTry.push(selfRequestUrl.replace('https://', 'http://'))
    } else if (selfRequestUrl.startsWith('http://')) {
      urlsToTry.push(selfRequestUrl.replace('http://', 'https://'))
    }

    for (const urlToTry of urlsToTry) {
      // Verify URL is safe (self URL already verified, alternate needs verification).
      const verifiedUrl = await prepareUrl(urlToTry)
      if (!verifiedUrl) continue

      try {
        const selfResponse = await fetchFn(verifiedUrl)

        if (selfResponse.status >= 200 && selfResponse.status < 300) {
          const isMatch = await compareResponses(
            initialResponseBody,
            initialResponseHash,
            initialParsed,
            selfResponse.body,
            parser,
          )

          if (isMatch) {
            // URL is valid - use destination URL (after redirects) as source for variants.
            variantSource = (await prepareUrl(selfResponse.url)) ?? initialResponseUrl
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
  const variantPromises = tiers.map((tier) => prepareUrl(normalizeUrl(variantSource, tier)))
  const variantResults = await Promise.all(variantPromises)
  const variants = new Set(variantResults.filter((url): url is string => url !== undefined))
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

      const isMatch = await compareResponses(
        initialResponseBody,
        initialResponseHash,
        initialParsed,
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
    const httpsUrl = await prepareUrl(winningUrl.replace('http://', 'https://'))

    if (httpsUrl) {
      try {
        const httpsResponse = await fetchFn(httpsUrl)

        if (httpsResponse.status >= 200 && httpsResponse.status < 300) {
          const isMatch = await compareResponses(
            initialResponseBody,
            initialResponseHash,
            initialParsed,
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
