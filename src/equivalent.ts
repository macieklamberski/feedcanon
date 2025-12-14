import { defaultFetchFn, defaultNormalizeOptions, defaultVerifyFn } from './defaults.js'
import type { EquivalentOptions, EquivalentResult, FetchFnResponse } from './types.js'
import { isSimilarUrl } from './utils.js'

export const areEquivalent = async (
  url1: string,
  url2: string,
  options?: EquivalentOptions,
): Promise<EquivalentResult> => {
  const normalizeOptions = options?.normalizeOptions ?? defaultNormalizeOptions
  const fetchFn = options?.fetchFn ?? defaultFetchFn
  const verifyFn = options?.verifyFn ?? defaultVerifyFn

  // Method 1: Normalize (URL normalization).
  if (isSimilarUrl(url1, url2, normalizeOptions)) {
    return { equivalent: true, method: 'normalize' }
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

  return { equivalent: false, method: null }
}
