---
title: Using Callbacks
---

# Using Callbacks

Feedcanon provides callbacks to track progress and hook into the resolution flow:

| Callback | Fires when | Data |
|----------|------------|------|
| `onFetch` | After each HTTP response | `{ url, response }` |
| `onMatch` | URL matches initial response | `{ url, response, feed }` |
| `onExists` | The returned URL was found by `existsFn` | `{ url, data }` |
| `onCanonical` | Once, with the returned URL | `{ url, response, feed }` |

::: details Errors and async callbacks
Callbacks are called synchronously and not awaited. If a callback throws, or `existsFn` throws or rejects, `findCanonical` stops and returns `undefined`. A rejection from an async callback is not caught, so handle it inside the callback.
:::

## onFetch

Fires for every response, including non-2xx ones. It does not fire when the fetch itself throws, since there is no response to pass.

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  onFetch: ({ url, response }) => {
    console.log(`${response.status} ${url}`)
  },
})
```

The `response` object contains:

| Property | Type | Description |
|----------|------|-------------|
| `status` | `number` | HTTP status code |
| `url` | `string` | Final URL after redirects |
| `body` | `string` | Response body |
| `headers` | `Headers` | Response headers |
| `redirects` | `Array<{ url: string; status: number }>` | Redirects followed to reach `url`, when the fetch function lists them |

### Use Cases

- Logging HTTP requests for debugging
- Tracking redirect chains
- Monitoring request counts

## onMatch

Fires when a URL candidate produces content matching the initial response. It also fires once for the input URL, right after the feed is parsed and before any candidate is tested. If rewrites are configured, the URL reported is the rewritten one. Each URL is reported once per call.

```typescript
import { findCanonical } from 'feedcanon'

const aliases = []

const url = await findCanonical('https://example.com/feed', {
  onMatch: ({ url, feed }) => {
    console.log(`Match: ${url}`)
    aliases.push(url)
  },
})

// aliases contains all URLs that serve the same feed
```

The callback receives:

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | The matching URL |
| `response` | `FetchFnResponse` | The HTTP response |
| `feed` | `TFeed` | Parsed feed object |

### Use Cases

- Collecting URL aliases for the same feed
- Logging which candidates work
- Building redirect maps

## onExists

Use `existsFn` to check if URLs already exist in your database. When found, that URL is returned once it serves the same feed, without further testing.

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  existsFn: async (url) => {
    return await db.feeds.findByUrl(url)
  },
  onExists: ({ url, data }) => {
    console.log('Found existing:', url, data.id)
  },
})
```

The `existsFn` function:
- Receives each URL Feedcanon adopts or tests as a candidate, then the same URL under the other protocol
- Returns your data if URL exists, `null` or `undefined` otherwise
- Triggers early termination when a match is found

The `onExists` callback fires once, with the URL and your database record, when `existsFn` found the URL that `findCanonical` returns.

::: details How a known URL is verified
- **One lookup per URL.** Each URL is looked up once per call, and its answer reused when a later phase adopts it again.
- **Verification.** A known URL Feedcanon has not fetched yet in the call is fetched once to check that it serves the same feed. The one exception is a `cleanUrlFn` result that only edits the query, which is trusted without a fetch.
- **The other protocol.** After each URL, `existsFn` receives its form under the other protocol: the http form of an https URL, the https form of an http one. A known form is accepted only once it serves the same feed, and skipped when it serves a different feed or cannot be fetched.
- **Less clean forms.** When no candidate is known, `existsFn` also receives each candidate with `www.` added, with a trailing slash added, and with both. A known form that serves the same feed is returned, so a feed stored under a less clean URL than the one entered is not stored twice. It is returned even when it redirects permanently to the cleaner URL.
- **Temporary redirects.** A URL that redirects temporarily is kept, but its final URL served the feed too. For the input URL, a self URL and a probe result, `existsFn` receives that final URL as well, with its query cleaned by `cleanUrlFn`. A known one is returned, so a feed stored under it is not stored twice. When `existsFn` knows the requested URL too, the requested URL is returned.
- **A known URL that is skipped** does not fire `onExists`: one that serves a different feed, cannot be fetched, or redirects permanently to another URL.
- **`onCanonical` for a known URL** carries the response that verified it, since Feedcanon returns a URL only after it served the same feed in the call.
:::

## onCanonical

Fires once, right before `findCanonical` returns a URL, with that URL and the response that served it. This is the place to read the canonical response, for example to store its ETag or Last-Modified header next to the URL. `onMatch` fires for every URL serving the same feed, in the order Feedcanon reaches them, so the last match is not always the returned URL.

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('http://www.example.com/feed/', {
  onCanonical: ({ url, response, feed }) => {
    console.log(url, response.headers.get('etag'))
  },
})
```

The callback receives:

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | The URL `findCanonical` returns |
| `response` | `FetchFnResponse` | The response that served the URL |
| `feed` | `TFeed` | Parsed feed object |

The callback does not fire when `findCanonical` returns `undefined`.

## Examples

### Logging

```typescript
const url = await findCanonical('https://example.com/feed', {
  onFetch: ({ url, response }) => {
    console.log(`[${response.status}] ${url}`)
  },
  onMatch: ({ url }) => {
    console.log(`[MATCH] ${url}`)
  },
})
```

### Collecting Aliases

```typescript
const aliases = []

// Every protocol, www and trailing slash variant serves the same feed.
const url = await findCanonical('http://www.example.com/feed/', {
  onMatch: ({ url }) => {
    aliases.push(url)
  },
})

// url: 'https://example.com/feed'
// aliases: [
//   'http://www.example.com/feed/',
//   'http://example.com/feed',
//   'https://example.com/feed',
// ]
```

### Database Lookup

```typescript
const url = await findCanonical('https://example.com/feed', {
  existsFn: async (url) => {
    const [feed] = await db
      .select()
      .from(feeds)
      .where(eq(feeds.url, url))
      .limit(1)

    return feed
  },
  onExists: ({ url, data }) => {
    console.log('Using existing feed:', data.id)
  },
})
```

### Full Tracing

```typescript
const url = await findCanonical('https://example.com/feed', {
  existsFn: async (url) => db.feeds.findByUrl(url),

  onFetch: ({ url, response }) => {
    console.log(`Fetch: ${response.status} ${url}`)
  },

  onMatch: ({ url, feed }) => {
    console.log(`Match: ${url}`)
  },

  onExists: ({ url, data }) => {
    console.log(`Exists: ${url} (id: ${data.id})`)
  },

  onCanonical: ({ url, response }) => {
    console.log(`Canonical: ${url} (${response.status})`)
  },
})
```
