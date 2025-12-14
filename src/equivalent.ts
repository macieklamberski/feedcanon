import { defaultNormalizeOptions } from './defaults.js'
import type { EquivalentOptions, EquivalentResult } from './types.js'
import { isSimilarUrl } from './utils.js'

export const areEquivalent = async (
  url1: string,
  url2: string,
  options?: EquivalentOptions,
): Promise<EquivalentResult> => {
  const normalizeOptions = options?.normalizeOptions ?? defaultNormalizeOptions

  // Method 1: Normalize (URL normalization).
  if (isSimilarUrl(url1, url2, normalizeOptions)) {
    return { equivalent: true, method: 'normalize' }
  }

  return { equivalent: false, method: null }
}
