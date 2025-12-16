import { defaultFetchFn, defaultHashFn, defaultNormalizeOptions, defaultVerifyFn } from './defaults.js'
import type { CanonicalizeOptions, CanonicalizeResult } from './types.js'
import { isSimilarUrl, resolveUrl } from './utils.js'

export const canonicalize = async <T>(
  url: string,
  options?: CanonicalizeOptions<T>,
): Promise<CanonicalizeResult> => {
  const fetchFn = options?.fetchFn ?? defaultFetchFn
  const verifyFn = options?.verifyFn ?? defaultVerifyFn
  const hashFn = options?.hashFn ?? defaultHashFn
  const parser = options?.parser

  // Step 1: Fetch the input URL.
  let response: Awaited<ReturnType<typeof fetchFn>>

  try {
    response = await fetchFn(url)
  } catch {
    return { url, reason: 'fetch_failed' }
  }

  if (response.status < 200 || response.status >= 300) {
    return { url, reason: 'fetch_failed' }
  }

  const responseUrl = response.url
  const responseBody = response.body

  // Compute response hash lazily (only when needed).
  let responseHash: string | undefined

  const getResponseHash = async () => {
    if (responseHash === undefined) {
      responseHash = await hashFn(responseBody)
    }
    return responseHash
  }

  // Step 2: Parse response to extract selfUrl.
  if (!parser) {
    return { url: responseUrl, reason: 'no_self_url' }
  }

  const parsed = parser.parse(responseBody)

  if (!parsed) {
    return { url: responseUrl, reason: 'no_self_url' }
  }

  const rawSelfUrl = parser.getSelfUrl(parsed)

  if (!rawSelfUrl) {
    return { url: responseUrl, reason: 'no_self_url' }
  }

  // Step 3: Resolve selfUrl.
  const selfUrl = resolveUrl(rawSelfUrl, responseUrl)

  if (!selfUrl) {
    return { url: responseUrl, reason: 'fallback' }
  }

  // Step 4: Check if selfUrl equals responseUrl.
  if (selfUrl === responseUrl) {
    return { url: responseUrl, reason: 'same_url' }
  }

  // Step 5: Verify selfUrl is safe (e.g., SSRF protection).
  const isVerified = await verifyFn(selfUrl)

  if (!isVerified) {
    return { url: responseUrl, reason: 'verification_failed' }
  }

  // Method: Normalize - Check if URLs match after normalization.
  if (isSimilarUrl(selfUrl, responseUrl, defaultNormalizeOptions)) {
    return { url: selfUrl, reason: 'normalize' }
  }

  // Method: Redirects - Check if selfUrl redirects to responseUrl.
  let selfResponse: Awaited<ReturnType<typeof fetchFn>> | undefined

  try {
    selfResponse = await fetchFn(selfUrl)
    const selfOk = selfResponse.status >= 200 && selfResponse.status < 300

    if (selfOk && isSimilarUrl(selfResponse.url, responseUrl, defaultNormalizeOptions)) {
      return { url: selfUrl, reason: 'redirects' }
    }
  } catch {
    // selfUrl fetch failed, continue to fallback.
  }

  // Method: ResponseHash - Check if content hashes match.
  if (selfResponse && selfResponse.status >= 200 && selfResponse.status < 300) {
    const [cachedHash, selfHash] = await Promise.all([
      getResponseHash(),
      hashFn(selfResponse.body),
    ])

    if (cachedHash === selfHash) {
      return { url: selfUrl, reason: 'response_hash' }
    }

    // Method: FeedDataHash - Check if feed signatures match.
    if (parser.getSignature) {
      const selfParsed = parser.parse(selfResponse.body)

      if (selfParsed) {
        const responseSig = parser.getSignature(parsed)
        const selfSig = parser.getSignature(selfParsed)

        if (responseSig && selfSig) {
          const [responseSigHash, selfSigHash] = await Promise.all([
            hashFn(JSON.stringify(responseSig)),
            hashFn(JSON.stringify(selfSig)),
          ])

          if (responseSigHash === selfSigHash) {
            return { url: selfUrl, reason: 'feed_data_hash' }
          }
        }
      }
    }
  }

  // Method: UpgradeHttps - Try HTTPS version of HTTP selfUrl.
  if (selfUrl.startsWith('http://')) {
    const httpsUrl = selfUrl.replace('http://', 'https://')

    try {
      const httpsResponse = await fetchFn(httpsUrl)
      const httpsOk = httpsResponse.status >= 200 && httpsResponse.status < 300

      if (httpsOk) {
        return { url: httpsUrl, reason: 'upgrade_https' }
      }
    } catch {
      // HTTPS upgrade failed, continue to fallback.
    }
  }

  // Fallback: Return responseUrl.
  return { url: responseUrl, reason: 'fallback' }
}
