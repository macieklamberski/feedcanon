import { defaultFetch, defaultParser, defaultTiers } from './defaults.js'
import type {
  DefaultParserResult,
  FetchFnResponse,
  FindCanonicalOptions,
  ParserAdapter,
} from './types.js'
import { applyProbes, applyRewrites, normalizeUrl, resolveUrl } from './utils.js'

// The one url to file a feed under when its self link, redirects and aliases all serve one body.
export function findCanonical<
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
>(
  inputUrl: string,
  options?: Omit<FindCanonicalOptions<DefaultParserResult, TResponse, TExisting>, 'parser'>,
): Promise<string | undefined>

export function findCanonical<
  TFeed,
  TResponse extends FetchFnResponse = FetchFnResponse,
  TExisting = unknown,
>(
  inputUrl: string,
  options: FindCanonicalOptions<TFeed, TResponse, TExisting> & { parser: ParserAdapter<TFeed> },
): Promise<string | undefined>

export async function findCanonical(
  inputUrl: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary for function overloads.
  options?: FindCanonicalOptions<any, FetchFnResponse, unknown>,
): Promise<string | undefined> {
  const {
    parser = defaultParser,
    fetchFn = defaultFetch,
    cleanUrlFn,
    existsFn,
    tiers = defaultTiers,
    rewrites,
    probes,
    onFetch,
    onMatch,
    onExists,
  } = options ?? {}

  const stripParams = (url: string): string => {
    return normalizeUrl(cleanUrlFn ? cleanUrlFn(url) : url, {
      sortQueryParams: true,
      stripEmptyQuery: true,
    })
  }

  const resolveAndApplyRewrites = (url: string, baseUrl?: string): string | undefined => {
    const resolved = resolveUrl(url, baseUrl)
    return resolved && rewrites ? applyRewrites(resolved, rewrites) : resolved
  }

  const initialRequestUrl = resolveAndApplyRewrites(inputUrl)
  if (!initialRequestUrl) {
    return
  }

  let initialResponse: FetchFnResponse

  try {
    initialResponse = await fetchFn(initialRequestUrl)
  } catch {
    return
  }

  onFetch?.({ url: initialRequestUrl, response: initialResponse })

  if (initialResponse.status < 200 || initialResponse.status >= 300) {
    return
  }

  const initialResponseUrlRaw = resolveAndApplyRewrites(initialResponse.url)
  if (!initialResponseUrlRaw) {
    return
  }
  const initialResponseUrl = stripParams(initialResponseUrlRaw)

  const initialResponseBody = initialResponse.body
  if (!initialResponseBody) {
    return
  }

  let initialResponseSignature: string | undefined

  let selfRequestUrl: string | undefined

  const initialResponseFeed = await parser.parse(initialResponseBody)
  if (!initialResponseFeed) {
    return
  }

  onMatch?.({ url: initialRequestUrl, response: initialResponse, feed: initialResponseFeed })

  const selfRequestUrlRaw = parser.getSelfUrl(initialResponseFeed)

  if (selfRequestUrlRaw) {
    selfRequestUrl = resolveAndApplyRewrites(selfRequestUrlRaw, initialResponseUrl)
    selfRequestUrl = selfRequestUrl ? stripParams(selfRequestUrl) : undefined
  }

  const compareWithInitialResponse = async (
    comparedResponseBody: string | undefined,
    comparedResponseUrl: string,
  ): Promise<boolean> => {
    if (!comparedResponseBody) {
      return false
    }

    if (initialResponseBody === comparedResponseBody) {
      return true
    }

    const comparedResponseFeed = await parser.parse(comparedResponseBody)

    if (comparedResponseFeed) {
      initialResponseSignature ||= parser.getSignature(initialResponseFeed, initialResponseUrl)
      const comparedResponseSignature = parser.getSignature(
        comparedResponseFeed,
        comparedResponseUrl,
      )

      return initialResponseSignature === comparedResponseSignature
    }

    return false
  }

  const fetchAndCompare = async (url: string): Promise<FetchFnResponse | undefined> => {
    let response: FetchFnResponse

    try {
      response = await fetchFn(url)
    } catch {
      return
    }

    onFetch?.({ url, response })

    if (response.status < 200 || response.status >= 300) {
      return
    }

    if (!(await compareWithInitialResponse(response.body, response.url))) {
      return
    }

    return response
  }

  let candidateSourceUrl = initialResponseUrl

  if (selfRequestUrl && selfRequestUrl !== initialResponseUrl) {
    // A feed:// self link resolves to https even when the host only serves http.
    const urlsToTry = [selfRequestUrl]

    if (selfRequestUrl.startsWith('https://')) {
      urlsToTry.push(selfRequestUrl.replace('https://', 'http://'))
    } else if (selfRequestUrl.startsWith('http://')) {
      urlsToTry.push(selfRequestUrl.replace('http://', 'https://'))
    }

    for (const urlToTry of urlsToTry) {
      const response = await fetchAndCompare(urlToTry)

      if (response) {
        onMatch?.({ url: urlToTry, response, feed: initialResponseFeed })
        candidateSourceUrl = resolveAndApplyRewrites(response.url) ?? initialResponseUrl
        candidateSourceUrl = stripParams(candidateSourceUrl)
        break
      }
    }
  }

  if (probes && probes?.length > 0) {
    candidateSourceUrl = await applyProbes(candidateSourceUrl, probes, async (candidateUrl) => {
      const response = await fetchAndCompare(candidateUrl)

      if (response) {
        onMatch?.({ url: candidateUrl, response, feed: initialResponseFeed })
        return stripParams(resolveAndApplyRewrites(response.url) ?? candidateUrl)
      }
    })
  }

  const candidateUrls = new Set(
    tiers
      .map((tier) => resolveAndApplyRewrites(normalizeUrl(candidateSourceUrl, tier)))
      .filter((candidateUrl): candidateUrl is string => !!candidateUrl),
  )
  candidateUrls.add(candidateSourceUrl)

  let winningUrl = candidateSourceUrl

  for (const candidateUrl of candidateUrls) {
    if (existsFn) {
      const data = await existsFn(candidateUrl)

      if (data !== undefined) {
        onExists?.({ url: candidateUrl, data })
        return candidateUrl
      }
    }

    if (candidateUrl === candidateSourceUrl) {
      continue
    }

    if (candidateUrl === initialResponseUrl) {
      winningUrl = initialResponseUrl
      break
    }

    const candidateResponse = await fetchAndCompare(candidateUrl)
    if (candidateResponse) {
      let candidateResponseUrl = resolveAndApplyRewrites(candidateResponse.url)
      if (candidateResponseUrl) {
        candidateResponseUrl = stripParams(candidateResponseUrl)
      }

      if (
        candidateResponseUrl === candidateSourceUrl ||
        candidateResponseUrl === initialResponseUrl
      ) {
        continue
      }

      onMatch?.({ url: candidateUrl, response: candidateResponse, feed: initialResponseFeed })
      winningUrl = candidateUrl
      break
    }
  }

  if (winningUrl.startsWith('http://')) {
    const httpsUrl = winningUrl.replace('http://', 'https://')
    const response = await fetchAndCompare(httpsUrl)

    if (response) {
      onMatch?.({ url: httpsUrl, response, feed: initialResponseFeed })
      return httpsUrl
    }
  }

  return winningUrl
}
