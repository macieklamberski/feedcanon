import {
  defaultCanonicalizeMethods,
  defaultFetchFn,
  defaultHashFn,
  defaultVerifyFn,
} from './defaults.js'
import type { CanonicalizeOptions, CanonicalizeResult } from './types.js'
import { isSimilarUrl, resolveUrl } from './utils.js'

export const canonicalize = async <T>(
  url: string,
  options?: CanonicalizeOptions<T>,
): Promise<CanonicalizeResult> => {
  const methods = options?.methods ?? defaultCanonicalizeMethods
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
  const responseHash = responseBody ? await hashFn(responseBody) : undefined

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

  // Step 3: Resolve selfUrl (convert protocols, resolve relative URLs).
  const selfUrl = resolveUrl(rawSelfUrl, responseUrl)

  if (!selfUrl) {
    return { url: responseUrl, reason: 'verification_failed' }
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
  if (methods.normalize) {
    if (isSimilarUrl(selfUrl, responseUrl, methods.normalize)) {
      return { url: selfUrl, reason: 'normalize' }
    }
  }

  // Method: Redirects - Check if selfUrl redirects to responseUrl.
  if (methods.redirects !== false) {
    try {
      const selfResponse = await fetchFn(selfUrl)

      if (selfResponse.status >= 200 && selfResponse.status < 300) {
        if (selfResponse.url === responseUrl) {
          return { url: responseUrl, reason: 'redirects' }
        }

        // Method: Response hash - Check if content matches.
        if (methods.responseHash !== false && responseHash) {
          const selfHash = selfResponse.body ? await hashFn(selfResponse.body) : null

          if (selfHash && responseHash === selfHash) {
            return { url: selfUrl, reason: 'response_hash' }
          }

          // Hashes don't match - content is different.
          if (selfHash && responseHash !== selfHash) {
            return { url: responseUrl, reason: 'different_content' }
          }
        }

        // Method: Feed data hash - Compare parsed feed signatures.
        if (methods.feedDataHash === true && selfResponse.body) {
          const selfParsed = parser.parse(selfResponse.body)

          if (parsed && selfParsed) {
            const responseSignature = JSON.stringify(parser.getSignature(parsed))
            const selfSignature = JSON.stringify(parser.getSignature(selfParsed))
            const responseSignatureHash = await hashFn(responseSignature)
            const selfSignatureHash = await hashFn(selfSignature)

            if (responseSignatureHash === selfSignatureHash) {
              return { url: selfUrl, reason: 'feed_data_hash' }
            }

            // Signatures don't match - content is different.
            return { url: responseUrl, reason: 'different_content' }
          }
        }
      }
    } catch {
      return { url: responseUrl, reason: 'fetch_failed' }
    }
  }

  // Method: Upgrade HTTPS - Try HTTPS version of HTTP selfUrl.
  if (methods.upgradeHttps !== false && selfUrl.startsWith('http://')) {
    const httpsUrl = selfUrl.replace('http://', 'https://')
    const isHttpsVerified = await verifyFn(httpsUrl)

    if (isHttpsVerified) {
      try {
        const httpsResponse = await fetchFn(httpsUrl)

        if (httpsResponse.status >= 200 && httpsResponse.status < 300) {
          // If we have responseHash, verify HTTPS content matches.
          if (responseHash) {
            const httpsHash = httpsResponse.body ? await hashFn(httpsResponse.body) : null
            if (httpsHash && httpsHash === responseHash) {
              return { url: httpsUrl, reason: 'upgrade_https' }
            }
          } else {
            return { url: httpsUrl, reason: 'upgrade_https' }
          }
        }
      } catch {
        // HTTPS upgrade failed, continue to fallback.
      }
    }
  }

  // Fallback: Return responseUrl.
  return { url: responseUrl, reason: 'fallback' }
}
