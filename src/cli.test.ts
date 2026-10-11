import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import packageJson from '../package.json' with { type: 'json' }
import { help, options, run } from './cli.js'

const msRegex = /\d+ ms/

describe('help', () => {
  it('should list every option', () => {
    for (const key of Object.keys(options)) {
      expect(help).toContain(`--${key}`)
    }
  })
})

describe('run', () => {
  const logSpy = spyOn(console, 'log').mockImplementation(() => {})
  const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
  const fetchSpy = spyOn(globalThis, 'fetch')
  const isTTY = process.stderr.isTTY

  const createFeed = (selfUrl: string) => {
    return `
      <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
          <title>Example Blog</title>
          <link>https://example.com/</link>
          <atom:link href="${selfUrl}" rel="self" />
          <item>
            <title>First post</title>
            <link>https://example.com/first-post</link>
          </item>
        </channel>
      </rss>
    `
  }

  const serve = (pages: Record<string, string>) => {
    return ((input: RequestInfo | URL) => {
      const url = input.toString()
      const body = pages[url]
      const response = new Response(body ?? 'Not Found', { status: body ? 200 : 404 })

      // A constructed Response has an empty url, while defaultFetch returns it as the final URL.
      Object.defineProperty(response, 'url', { value: url })

      return Promise.resolve(response)
    }) as typeof fetch
  }

  // Request times vary from run to run, so they are masked.
  const getErrors = () => {
    return errorSpy.mock.calls.map((call) => String(call[0]).replace(msRegex, 'N ms'))
  }

  beforeEach(() => {
    logSpy.mockClear()
    errorSpy.mockClear()
    fetchSpy.mockImplementation(serve({}))
    process.stderr.isTTY = false
    process.exitCode = 0
  })

  afterAll(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    fetchSpy.mockRestore()
    process.stderr.isTTY = isTTY
    process.exitCode = 0
  })

  describe('happy paths', () => {
    it('should print help with --help', async () => {
      await run(['https://example.com/feed', '--help'])

      expect(logSpy).toHaveBeenCalledWith(help)
      expect(process.exitCode).toBe(0)
    })

    it('should print the canonical URL and a summary', async () => {
      const feed = createFeed('https://example.com/feed')
      const pages = {
        'https://example.com/feed?utm_source=x': feed,
        'https://example.com/feed': feed,
      }
      fetchSpy.mockImplementation(serve(pages))

      await run(['https://example.com/feed?utm_source=x'])

      expect(logSpy).toHaveBeenCalledWith('https://example.com/feed\n2 requests, 0.8 kB')
      expect(process.exitCode).toBe(0)
    })

    it('should print one JSON object with --json', async () => {
      const feed = createFeed('https://example.com/feed')
      fetchSpy.mockImplementation(serve({ 'https://example.com/feed': feed }))
      const expected = {
        url: 'https://example.com/feed',
        result: 'https://example.com/feed',
        requests: [
          {
            method: 'GET',
            url: 'https://example.com/feed',
            status: 200,
            responseUrl: 'https://example.com/feed',
            redirects: [],
            bytes: 400,
            ms: expect.any(Number),
          },
        ],
        totals: {
          requests: 1,
          bytes: 400,
          ms: expect.any(Number),
        },
      }

      await run(['https://example.com/feed', '--json'])

      expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual(expected)
    })

    it('should log every request and match to stderr with --verbose', async () => {
      const feed = createFeed('https://example.com/feed')
      fetchSpy.mockImplementation(serve({ 'https://example.com/feed?utm_source=x': feed }))
      const expected = [
        'GET https://example.com/feed?utm_source=x 200 N ms',
        'match https://example.com/feed?utm_source=x',
        'GET https://example.com/feed 404 N ms',
        'GET http://example.com/feed 404 N ms',
      ]

      await run(['https://example.com/feed?utm_source=x', '--verbose'])

      expect(getErrors()).toEqual(expected)
    })

    it('should log requests when stderr is a terminal', async () => {
      const feed = createFeed('https://example.com/feed')
      fetchSpy.mockImplementation(serve({ 'https://example.com/feed': feed }))
      process.stderr.isTTY = true
      const expected = ['GET https://example.com/feed 200 N ms', 'match https://example.com/feed']

      await run(['https://example.com/feed'])

      expect(getErrors()).toEqual(expected)
    })

    it('should not log requests when stderr is not a terminal', async () => {
      const feed = createFeed('https://example.com/feed')
      fetchSpy.mockImplementation(serve({ 'https://example.com/feed': feed }))

      await run(['https://example.com/feed'])

      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should probe the WordPress feed path by default', async () => {
      const feed = createFeed('https://example.com/?feed=rss2')
      const pages = {
        'https://example.com/?feed=rss2': feed,
        'https://example.com/feed': feed,
      }
      fetchSpy.mockImplementation(serve(pages))

      await run(['https://example.com/?feed=rss2'])

      expect(logSpy).toHaveBeenCalledWith('https://example.com/feed\n2 requests, 0.8 kB')
    })

    it('should skip the WordPress probe with --no-probes', async () => {
      const feed = createFeed('https://example.com/?feed=rss2')
      const pages = {
        'https://example.com/?feed=rss2': feed,
        'https://example.com/feed': feed,
      }
      fetchSpy.mockImplementation(serve(pages))

      await run(['https://example.com/?feed=rss2', '--no-probes'])

      expect(logSpy).toHaveBeenCalledWith('https://example.com/?feed=rss2\n2 requests, 0.4 kB')
    })

    it('should rewrite a FeedBurner alias host by default', async () => {
      const feed = createFeed('https://feeds2.feedburner.com/example')
      fetchSpy.mockImplementation(serve({ 'https://feeds.feedburner.com/example': feed }))

      await run(['https://feeds2.feedburner.com/example'])

      expect(logSpy).toHaveBeenCalledWith('https://feeds.feedburner.com/example\n1 request, 0.4 kB')
    })

    it('should skip the rewrites with --no-rewrites', async () => {
      const feed = createFeed('https://feeds2.feedburner.com/example')
      fetchSpy.mockImplementation(serve({ 'https://feeds.feedburner.com/example': feed }))

      await run(['https://feeds2.feedburner.com/example', '--no-rewrites'])

      expect(errorSpy).toHaveBeenCalledWith('No canonical URL found\n1 request, 0 kB')
      expect(process.exitCode).toBe(1)
    })
  })

  describe('sad paths', () => {
    it('should fail when the URL is missing', async () => {
      await run([])

      expect(errorSpy).toHaveBeenCalledWith(`URL is required\n\n${help}`)
      expect(process.exitCode).toBe(2)
    })

    it('should fail on an extra argument', async () => {
      await run(['https://example.com/feed', 'https://example.org/feed'])

      expect(errorSpy).toHaveBeenCalledWith(
        `Unexpected argument: https://example.org/feed\n\n${help}`,
      )
      expect(process.exitCode).toBe(2)
    })

    it('should fail on an unknown flag', async () => {
      await run(['https://example.com/feed', '--timeout', '10'])

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("'--timeout'"))
      expect(process.exitCode).toBe(2)
    })

    it('should fail when no canonical URL is found', async () => {
      await run(['https://example.com/feed'])

      expect(errorSpy).toHaveBeenCalledWith('No canonical URL found\n1 request, 0 kB')
      expect(logSpy).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    })

    it('should print a null result with --json when no canonical URL is found', async () => {
      await run(['https://example.com/feed', '--json'])

      expect(JSON.parse(logSpy.mock.calls[0][0]).result).toBeNull()
      expect(process.exitCode).toBe(1)
    })

    it('should log a request that throws with its error', async () => {
      fetchSpy.mockImplementation((() => Promise.reject(new Error('Connection refused'))) as never)
      const expected = [
        'GET https://example.com/feed Connection refused N ms',
        'No canonical URL found\n1 request, 0 kB',
      ]

      await run(['https://example.com/feed', '--verbose'])

      expect(getErrors()).toEqual(expected)
      expect(process.exitCode).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should log the redirect statuses and the final URL', async () => {
      const feed = createFeed('https://example.com/feed')
      fetchSpy.mockImplementation(((input: RequestInfo | URL) => {
        if (input.toString() === 'https://example.com/rss') {
          const response = new Response(null, {
            status: 301,
            headers: { location: 'https://example.com/feed' },
          })

          return Promise.resolve(response)
        }

        return serve({ 'https://example.com/feed': feed })(input)
      }) as typeof fetch)

      await run(['https://example.com/rss', '--verbose'])

      expect(getErrors()[0]).toBe(
        'GET https://example.com/rss 301 → 200 N ms → https://example.com/feed',
      )
    })
  })
})

describe('bin', () => {
  it('should run the built CLI from the published bin', () => {
    // Inside the repo, so the built files resolve their dependencies from node_modules.
    mkdirSync(join('node_modules', '.cache'), { recursive: true })
    const outDir = mkdtempSync(join('node_modules', '.cache', 'feedcanon-bin-'))

    try {
      // The real build script, so the bin is checked against the file names the build emits.
      const build = Bun.spawnSync(['bun', 'run', 'build', '--out-dir', join(outDir, 'dist')])
      expect(build.exitCode).toBe(0)

      cpSync('bin', join(outDir, 'bin'), { recursive: true })
      const cli = Bun.spawnSync([
        'node',
        join(outDir, 'bin', packageJson.bin.feedcanon.replace('bin/', '')),
        '--help',
      ])

      expect(cli.stdout.toString().trim()).toBe(help)
      expect(cli.exitCode).toBe(0)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  }, 60_000)
})
