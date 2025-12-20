import { defaultPlatforms, defaultTiers } from './defaults.js'
import type { CanonicalizeOptions } from './types.js'
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

  // Phase 1: Initial Fetch.
  // Apply platform handlers to convert aliases to canonical domains before fetching.
  const platformizedInputUrl = applyPlatformHandlers(inputUrl, platforms)
  let response: Awaited<ReturnType<typeof fetchFn>>

  try {
    response = await fetchFn(platformizedInputUrl)
  } catch {
    return
  }

  if (response.status < 200 || response.status >= 300) {
    return
  }

  // Apply platform handlers to responseUrl (in case of redirects to an alias).
  const responseUrl = applyPlatformHandlers(response.url, platforms)
  const responseBody = response.body
  const responseHash = responseBody ? await hashFn(responseBody) : undefined

  // Phase 2: Extract and normalize self URL.
  let selfUrl: string | undefined

  if (parser) {
    let parsed: ReturnType<typeof parser.parse>

    try {
      parsed = parser.parse(responseBody)
    } catch {
      // Invalid feed content (empty, malformed, etc.).
      return
    }

    if (parsed) {
      const rawSelfUrl = parser.getSelfUrl(parsed)

      if (rawSelfUrl) {
        const resolved = resolveUrl(rawSelfUrl, responseUrl)

        if (resolved) {
          // Apply platform handlers to convert selfUrl aliases to canonical domains.
          const platformizedSelfUrl = applyPlatformHandlers(resolved, platforms)
          const isVerified = verifyUrlFn ? await verifyUrlFn(platformizedSelfUrl) : true

          if (isVerified) {
            selfUrl = platformizedSelfUrl
          }
        }
      }
    }
  }

  // Phase 3: Validate self URL.
  // Try selfUrl first, then alternate protocol if it fails (e.g., feed:// resolved to https://
  // but only http:// works). This ensures we don't lose a valid selfUrl due to protocol mismatch.
  let variantSource = responseUrl

  if (selfUrl && selfUrl !== responseUrl && responseHash) {
    // Build list of URLs to try (selfUrl first, then alternate protocol).
    const urlsToTry = [selfUrl]

    if (selfUrl.startsWith('https://')) {
      urlsToTry.push(selfUrl.replace('https://', 'http://'))
    } else if (selfUrl.startsWith('http://')) {
      urlsToTry.push(selfUrl.replace('http://', 'https://'))
    }

    for (const urlToTry of urlsToTry) {
      // Verify URL is safe (selfUrl already verified in Phase 2, alternate needs verification).
      if (urlToTry !== selfUrl && verifyUrlFn) {
        const isVerified = await verifyUrlFn(urlToTry)

        if (!isVerified) {
          continue
        }
      }

      try {
        const selfResponse = await fetchFn(urlToTry)

        if (selfResponse.status >= 200 && selfResponse.status < 300) {
          const selfHash = selfResponse.body ? await hashFn(selfResponse.body) : undefined

          if (selfHash === responseHash) {
            // URL is valid - use destination URL (after redirects) as source for variants.
            variantSource = applyPlatformHandlers(selfResponse.url, platforms)
            break
          }
        }
      } catch {
        // This URL failed, try next.
      }
    }
  } else if (selfUrl === responseUrl) {
    // selfUrl matches responseUrl, use it.
    variantSource = responseUrl
  }

  // Phase 4: Generate Variants.
  // Apply platform handlers to each variant to normalize platform aliases.
  const variants = new Set(
    tiers.map((tier) => {
      return applyPlatformHandlers(normalizeUrl(variantSource, tier), platforms)
    }),
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

    // Skip if same as responseUrl (already known to work).
    if (variant === responseUrl) {
      winningUrl = responseUrl
      break
    }

    // Verify URL is safe (skip check if verifyUrlFn not provided).
    if (verifyUrlFn) {
      const isVerified = await verifyUrlFn(variant)

      if (!isVerified) {
        continue
      }
    }

    try {
      const variantResponse = await fetchFn(variant)

      if (variantResponse.status < 200 || variantResponse.status >= 300) {
        continue
      }

      const variantHash = variantResponse.body ? await hashFn(variantResponse.body) : undefined

      if (responseHash && variantHash === responseHash) {
        winningUrl = variant
        break
      }
    } catch {
      // Variant fetch failed, try next.
    }
  }

  // Phase 6: HTTPS Upgrade on winning URL.
  if (winningUrl.startsWith('http://')) {
    const httpsUrl = winningUrl.replace('http://', 'https://')
    const isHttpsVerified = verifyUrlFn ? await verifyUrlFn(httpsUrl) : true

    if (isHttpsVerified) {
      try {
        const httpsResponse = await fetchFn(httpsUrl)

        if (httpsResponse.status >= 200 && httpsResponse.status < 300) {
          const httpsHash = httpsResponse.body ? await hashFn(httpsResponse.body) : undefined

          if (responseHash && httpsHash === responseHash) {
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
