import {
  defaultEquivalentMethods,
  defaultFetchFn,
  defaultHashFn,
  defaultVerifyFn,
} from './defaults.js'
import type { EquivalentOptions, EquivalentResult, FetchFnResponse } from './types.js'
import { isSimilarUrl } from './utils.js'

export const areEquivalent = async <T>(
  url1: string,
  url2: string,
  options?: EquivalentOptions<T>,
): Promise<EquivalentResult> => {
  const methods = options?.methods ?? defaultEquivalentMethods
  const fetchFn = options?.fetchFn ?? defaultFetchFn
  const verifyFn = options?.verifyFn ?? defaultVerifyFn
  const hashFn = options?.hashFn ?? defaultHashFn
  const parser = options?.parser

  // Method 1: Normalize (URL normalization).
  if (methods.normalize) {
    if (isSimilarUrl(url1, url2, methods.normalize)) {
      return { equivalent: true, method: 'normalize' }
    }
  }

  // Verify URLs before fetching.
  const [verify1, verify2] = await Promise.all([verifyFn(url1), verifyFn(url2)])

  if (!verify1 || !verify2) {
    return { equivalent: false, method: null }
  }

  // Fetch both URLs.
  let response1: FetchFnResponse
  let response2: FetchFnResponse

  try {
    ;[response1, response2] = await Promise.all([fetchFn(url1), fetchFn(url2)])
  } catch {
    return { equivalent: false, method: null }
  }

  const isOk1 = response1.status >= 200 && response1.status < 300
  const isOk2 = response2.status >= 200 && response2.status < 300

  if (!isOk1 || !isOk2) {
    return { equivalent: false, method: null }
  }

  // Method 2: Redirects (check if URLs redirect to each other).
  if (methods.redirects !== false) {
    const finalUrl1 = response1.url
    const finalUrl2 = response2.url

    // Check if they redirect to the same URL.
    if (finalUrl1 === finalUrl2) {
      return { equivalent: true, method: 'redirects' }
    }

    // Check if one redirects to the other's original URL.
    if (finalUrl1 === url2 || finalUrl2 === url1) {
      return { equivalent: true, method: 'redirects' }
    }
  }

  // Method 3: Response hash (compare content).
  if (methods.responseHash !== false) {
    const hash1 = response1.body ? await hashFn(response1.body) : null
    const hash2 = response2.body ? await hashFn(response2.body) : null

    if (hash1 && hash2 && hash1 === hash2) {
      return { equivalent: true, method: 'response_hash' }
    }
  }

  // Method 4: Feed data hash - Compare parsed feed signatures.
  if (methods.feedDataHash === true && parser && response1.body && response2.body) {
    const parsed1 = parser.parse(response1.body)
    const parsed2 = parser.parse(response2.body)

    if (parsed1 && parsed2) {
      const signature1 = JSON.stringify(parser.getSignature(parsed1))
      const signature2 = JSON.stringify(parser.getSignature(parsed2))
      const signatureHash1 = await hashFn(signature1)
      const signatureHash2 = await hashFn(signature2)

      if (signatureHash1 === signatureHash2) {
        return { equivalent: true, method: 'feed_data_hash' }
      }
    }
  }

  return { equivalent: false, method: null }
}
