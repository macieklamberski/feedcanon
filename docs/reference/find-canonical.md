---
title: "Reference: findCanonical"
---

# findCanonical

The main function to find the canonical URL for a feed.

### `findCanonical()`

Finds the canonical URL for a given feed URL by fetching, parsing, and testing URL candidates.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputUrl` | `string` | The feed URL to canonicalize |
| `options` | `object` | Optional configuration |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `parser` | [`ParserAdapter`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | [`defaultParser`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts) | Custom feed parser. See [Feed Parsing](/guides/customization/feed-parsing) |
| `fetchFn` | [`FetchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | [`defaultFetch`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts) | Custom fetch function. See [Data Fetching](/guides/customization/data-fetching) |
| `cleanUrlFn` | `(url: string) => string` | — | Clean URLs before candidate generation (e.g. [urlpurify](https://github.com/macieklamberski/urlpurify)). Query edits are trusted, a changed host or path is verified first. See [URL Tiers](/guides/customization/url-tiers#strip-tracking-params) |
| `existsFn` | [`ExistsFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | Database lookup function. See [Using Callbacks](/guides/callbacks#onexists) |
| `tiers` | [`Tier[]`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | [`defaultTiers`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts) | URL normalization tiers. See [URL Tiers](/guides/customization/url-tiers) |
| `rewrites` | [`Rewrite[]`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | URL rewrites. See [URL Rewrites](/guides/customization/url-rewrites) |
| `probes` | [`Probe[]`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | URL probes for testing alternate URL forms. See [URL Probes](/guides/customization/url-probes) |
| `onFetch` | [`OnFetchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | Callback after each fetch. See [Using Callbacks](/guides/callbacks#onfetch) |
| `onMatch` | [`OnMatchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | Callback when URL matches. See [Using Callbacks](/guides/callbacks#onmatch) |
| `onExists` | [`OnExistsFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | Callback when URL exists. See [Using Callbacks](/guides/callbacks#onexists) |
| `onCanonical` | [`OnCanonicalFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) | — | Callback with the returned URL and the response that served it, the place to read the canonical response. See [Using Callbacks](/guides/callbacks#oncanonical) |

#### Returns

`Promise<string | undefined>`: The canonical URL, or `undefined` if the feed is invalid or unreachable. The promise never rejects: an error thrown by any option you pass in, such as `existsFn` or `onMatch`, resolves to `undefined` as well. A few errors only skip one step and the lookup carries on: a rewrite or probe that throws, and a parser that throws on a candidate's body.

#### Example

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://www.example.com/feed/?utm_source=rss')

// 'https://example.com/feed'
```
