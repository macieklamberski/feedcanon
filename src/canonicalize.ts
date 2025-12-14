import { defaultFetchFn, defaultNormalizeOptions } from './defaults.js'
import type { CanonicalizeOptions, CanonicalizeResult } from './types.js'
import { isSimilarUrl, resolveUrl } from './utils.js'

export const canonicalize = async <T>(
  url: string,
  options?: CanonicalizeOptions<T>,
): Promise<CanonicalizeResult> => {
  const fetchFn = options?.fetchFn ?? defaultFetchFn
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

  // Method: Normalize - Check if URLs match after normalization.
  if (isSimilarUrl(selfUrl, responseUrl, defaultNormalizeOptions)) {
    return { url: selfUrl, reason: 'normalize' }
  }

  // Fallback: Return responseUrl.
  return { url: responseUrl, reason: 'fallback' }
}
