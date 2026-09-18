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
| `parser` | [`ParserAdapter`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | [`defaultParser`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/defaults.ts) | Custom feed parser. See [Feed Parsing](/guides/customization/feed-parsing) |
| `fetchFn` | [`FetchFn`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | [`defaultFetch`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/defaults.ts) | Custom fetch function. See [Data Fetching](/guides/customization/data-fetching) |
| `existsFn` | [`ExistsFn`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | Database lookup function. See [Using Callbacks](/guides/callbacks#onexists) |
| `tiers` | [`Tier[]`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | [`defaultTiers`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/defaults.ts) | URL normalization tiers. See [URL Tiers](/guides/customization/url-tiers) |
| `rewrites` | [`Rewrite[]`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | URL rewrites. See [URL Rewrites](/guides/customization/url-rewrites) |
| `probes` | [`Probe[]`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | URL probes for testing alternate URL forms. See [URL Probes](/guides/customization/url-probes) |
| `stripQueryParams` | `string[]` | [`defaultStrippedParams`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/defaults.ts) | Query params to strip |
| `onFetch` | [`OnFetchFn`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | Callback after each fetch. See [Using Callbacks](/guides/callbacks#onfetch) |
| `onMatch` | [`OnMatchFn`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | Callback when URL matches. See [Using Callbacks](/guides/callbacks#onmatch) |
| `onExists` | [`OnExistsFn`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/types.ts) | — | Callback when URL exists. See [Using Callbacks](/guides/callbacks#onexists) |

#### Returns

`Promise<string | undefined>`: The canonical URL, or `undefined` if the feed is invalid or unreachable.

#### Example

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://www.example.com/feed/?utm_source=rss')

// 'https://example.com/feed'
```
