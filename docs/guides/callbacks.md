---
title: Using Callbacks
---

# Using Callbacks

Feedcanon provides callbacks to track progress and hook into the resolution flow. If a callback or `existsFn` throws, `findCanonical` stops and returns `undefined`:

| Callback | Fires when | Data |
|----------|------------|------|
| `onFetch` | After each HTTP response | `{ url, response }` |
| `onMatch` | URL matches initial response | `{ url, response, feed }` |
| `onExists` | `existsFn` finds URL in database | `{ url, data }` |

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

Fires when a URL candidate produces content matching the initial response. It also fires once for the input URL, right after the feed is parsed and before any candidate is tested. If rewrites are configured, the URL reported is the rewritten one.

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

Use `existsFn` to check if URLs already exist in your database. When found, that URL is returned immediately without further testing. The one exception is a URL that exists only once the query is dropped. A query can select a different feed, so Feedcanon fetches that URL first and returns it only if it serves the same feed.

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
- Receives each URL candidate being tested, then the same URL under the other protocol: the http form of an https candidate, the https form of an http one
- Returns your data if URL exists, `null` or `undefined` otherwise
- Triggers early termination when a match is found

The `onExists` callback fires when `existsFn` returns data, giving you access to both the URL and your database record.

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
})
```
