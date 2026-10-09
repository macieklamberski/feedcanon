import { type ParseArgsConfig, parseArgs } from 'node:util'
import { defaultFetch } from './defaults.js'
import { findCanonical } from './index.js'
import { wordpressProbe } from './probes/wordpress.js'
import { bloggerRewrite } from './rewrites/blogger.js'
import { feedburnerRewrite } from './rewrites/feedburner.js'
import type { FetchFn, FetchFnRedirect } from './types.js'

type Request = {
  method: string
  url: string
  status?: number
  responseUrl?: string
  redirects?: Array<FetchFnRedirect>
  bytes?: number
  ms: number
  error?: string
}

export const options = {
  json: { type: 'boolean' },
  verbose: { type: 'boolean' },
  'no-rewrites': { type: 'boolean' },
  'no-probes': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsConfig['options']

export const help = `Usage: feedcanon <url> [options]

Options:
  --json         Print one JSON object instead of the URL and summary
  --verbose      Log every request to stderr, also when it is not a terminal
  --no-rewrites  Turn off the Blogger and FeedBurner rewrites
  --no-probes    Turn off the WordPress probe
  -h, --help     Show help`

const kilobytes = new Intl.NumberFormat('en', {
  style: 'unit',
  unit: 'kilobyte',
  maximumFractionDigits: 1,
})

const formatRequest = (request: Request): string => {
  if (request.error) {
    return `${request.method} ${request.url} ${request.error} ${request.ms} ms`
  }

  const statuses = [...(request.redirects ?? []).map((redirect) => redirect.status), request.status]
  const line = `${request.method} ${request.url} ${statuses.join(' → ')} ${request.ms} ms`

  if (!request.redirects?.length) {
    return line
  }

  return `${line} → ${request.responseUrl}`
}

const formatSummary = (requests: Array<Request>, bytes: number): string => {
  const noun = requests.length === 1 ? 'request' : 'requests'

  return `${requests.length} ${noun}, ${kilobytes.format(bytes / 1000)}`
}

export const run = async (args = process.argv.slice(2)) => {
  const parseArguments = () => {
    try {
      return parseArgs({ args, options, allowPositionals: true })
    } catch (error) {
      console.error(`${error instanceof Error ? error.message : error}\n\n${help}`)
      process.exitCode = 2
    }
  }

  const parsed = parseArguments()

  if (!parsed) {
    return
  }

  const { values, positionals } = parsed

  if (values.help) {
    console.log(help)
    return
  }

  const [url, ...extra] = positionals

  if (!url) {
    console.error(`URL is required\n\n${help}`)
    process.exitCode = 2
    return
  }

  if (extra.length > 0) {
    console.error(`Unexpected argument: ${extra[0]}\n\n${help}`)
    process.exitCode = 2
    return
  }

  const isLogging = values.verbose || process.stderr.isTTY
  const requests: Array<Request> = []

  const log = (line: string) => {
    if (isLogging) {
      console.error(line)
    }
  }

  // A fetch that throws never reaches onFetch, so requests are recorded around the fetch itself.
  const fetchFn: FetchFn = async (requestUrl, fetchOptions) => {
    const start = performance.now()
    const request: Request = { method: fetchOptions?.method ?? 'GET', url: requestUrl, ms: 0 }
    requests.push(request)

    try {
      const response = await defaultFetch(requestUrl, fetchOptions)
      request.status = response.status
      request.responseUrl = response.url
      request.redirects = response.redirects
      request.bytes = Buffer.byteLength(response.body)

      return response
    } catch (error) {
      request.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      request.ms = Math.round(performance.now() - start)
      log(formatRequest(request))
    }
  }

  const start = performance.now()
  const result = await findCanonical(url, {
    fetchFn,
    rewrites: values['no-rewrites'] ? undefined : [bloggerRewrite, feedburnerRewrite],
    probes: values['no-probes'] ? undefined : [wordpressProbe],
    onMatch: (match) => {
      log(`match ${match.url}`)
    },
  })
  const ms = Math.round(performance.now() - start)
  const bytes = requests.reduce((total, request) => total + (request.bytes ?? 0), 0)

  if (!result) {
    process.exitCode = 1
  }

  if (values.json) {
    const output = {
      url,
      result: result ?? null,
      requests,
      totals: { requests: requests.length, bytes, ms },
    }

    console.log(JSON.stringify(output, null, 2))
    return
  }

  if (!result) {
    console.error(`No canonical URL found\n${formatSummary(requests, bytes)}`)
    return
  }

  console.log(`${result}\n${formatSummary(requests, bytes)}`)
}
