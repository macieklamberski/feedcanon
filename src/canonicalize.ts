import { defaultHashFn, defaultTiers, defaultVerifyFn } from './defaults.js'
import type { CanonicalizeOptions, CanonicalizeResult } from './types.js'
import { defaultFetchFn, normalizeUrl, resolveUrl } from './utils.js'

export const canonicalize = async <T>(
  inputUrl: string,
  options?: CanonicalizeOptions<T>,
): Promise<CanonicalizeResult> => {
  const {
    fetchFn = defaultFetchFn,
    verifyFn = defaultVerifyFn,
    hashFn = defaultHashFn,
    parser,
    tiers = defaultTiers,
    existsFn,
  } = options ?? {}

  // Phase 1: Initial Fetch.
  let response: Awaited<ReturnType<typeof fetchFn>>

  try {
    response = await fetchFn(inputUrl)
  } catch {
    return { url: inputUrl, reason: 'fetch_failed' }
  }

  if (response.status < 200 || response.status >= 300) {
    return { url: inputUrl, reason: 'fetch_failed' }
  }

  const responseUrl = response.url
  const responseBody = response.body
  const responseHash = responseBody ? await hashFn(responseBody) : undefined

  // Phase 2: Extract and Normalize Self URL.
  let selfUrl: string | undefined

  if (parser) {
    const parsed = parser.parse(responseBody)

    if (parsed) {
      const rawSelfUrl = parser.getSelfUrl(parsed)

      if (rawSelfUrl) {
        const resolved = resolveUrl(rawSelfUrl, responseUrl)

        if (resolved) {
          const isVerified = await verifyFn(resolved)

          if (isVerified) {
            selfUrl = resolved
          }
        }
      }
    }
  }

  // Phase 3: Validate Self URL.
  let variantSource = responseUrl

  if (selfUrl && selfUrl !== responseUrl && responseHash) {
    try {
      const selfResponse = await fetchFn(selfUrl)

      if (selfResponse.status >= 200 && selfResponse.status < 300) {
        const selfHash = selfResponse.body ? await hashFn(selfResponse.body) : undefined

        if (selfHash === responseHash) {
          // selfUrl is valid - use it as source for variants.
          variantSource = selfUrl
        }
      }
    } catch {
      // selfUrl fetch failed, use responseUrl.
    }
  } else if (selfUrl === responseUrl) {
    // selfUrl matches responseUrl, use it.
    variantSource = responseUrl
  }

  // Phase 4: Generate Variants.
  const variants = new Set(tiers.map((tier) => normalizeUrl(variantSource, tier)))
  variants.add(variantSource)

  // Phase 5: Test Variants (in tier order, first match wins).
  for (const variant of variants) {
    // Check if variant exists in database.
    if (existsFn) {
      const exists = await existsFn(variant)

      if (exists) {
        return { url: variant, reason: 'exists_in_db' }
      }
    }

    // Skip if same as variantSource (already verified).
    if (variant === variantSource) {
      continue
    }

    // Skip if same as responseUrl (already known to work).
    if (variant === responseUrl) {
      return { url: responseUrl, reason: 'content_verified' }
    }

    // Verify URL is safe.
    const isVerified = await verifyFn(variant)

    if (!isVerified) {
      continue
    }

    try {
      const variantResponse = await fetchFn(variant)

      if (variantResponse.status < 200 || variantResponse.status >= 300) {
        continue
      }

      const variantHash = variantResponse.body ? await hashFn(variantResponse.body) : undefined

      if (responseHash && variantHash === responseHash) {
        return { url: variant, reason: 'content_verified' }
      }
    } catch {
      // Variant fetch failed, try next.
    }
  }

  // Phase 6: HTTPS Upgrade.
  if (variantSource.startsWith('http://')) {
    const httpsUrl = variantSource.replace('http://', 'https://')
    const isHttpsVerified = await verifyFn(httpsUrl)

    if (isHttpsVerified) {
      try {
        const httpsResponse = await fetchFn(httpsUrl)

        if (httpsResponse.status >= 200 && httpsResponse.status < 300) {
          const httpsHash = httpsResponse.body ? await hashFn(httpsResponse.body) : undefined

          if (responseHash && httpsHash === responseHash) {
            return { url: httpsUrl, reason: 'upgrade_https' }
          }
        }
      } catch {
        // HTTPS upgrade failed.
      }
    }
  }

  // Fallback: Return variantSource.
  return { url: variantSource, reason: 'fallback' }
}
