import { defaultNormalizeOptions, defaultVerifyFn } from './defaults.js'
import type { EquivalentOptions, EquivalentResult } from './types.js'
import { isSimilarUrl } from './utils.js'

export const areEquivalent = async (
  url1: string,
  url2: string,
  options?: EquivalentOptions,
): Promise<EquivalentResult> => {
  const normalizeOptions = options?.normalizeOptions ?? defaultNormalizeOptions
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

  return { equivalent: false, method: null }
}
