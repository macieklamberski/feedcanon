---
prev: Guides › Platform Aliases
next: API Reference › Utilities
---

# findCanonical

The main function to find the canonical URL for a feed.

### `findCanonical()`

Finds the canonical URL for a given feed URL by fetching, parsing, and testing URL variants.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `inputUrl` | `string` | The feed URL to canonicalize |
| `options` | `object` | Optional configuration |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `parser` | [`ParserAdapter`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L7) | [`defaultParser`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts#L249) | Custom feed parser. See [Feed Parsing](/guides/customization/feed-parsing) |
| `fetchFn` | [`FetchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L90) | [`defaultFetch`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts#L235) | Custom fetch function. See [Data Fetching](/guides/customization/data-fetching) |
| `existsFn` | [`ExistsFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L79) | — | Database lookup function. See [Using Callbacks](/guides/callbacks#onexists) |
| `tiers` | [`Tier[]`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L37) | [`defaultTiers`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts#L272) | URL normalization tiers. See [URL Variants](/guides/customization/url-variants) |
| `platforms` | [`PlatformHandler[]`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L14) | [`defaultPlatforms`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts#L13) | Platform handlers. See [Platform Aliases](/guides/customization/platform-aliases) |
| `stripQueryParams` | `string[]` | [`defaultStrippedParams`](https://github.com/macieklamberski/feedcanon/blob/main/src/defaults.ts#L16) | Query params to strip |
| `onFetch` | [`OnFetchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L40) | — | Callback after each fetch. See [Using Callbacks](/guides/callbacks#onfetch) |
| `onMatch` | [`OnMatchFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L46) | — | Callback when URL matches. See [Using Callbacks](/guides/callbacks#onmatch) |
| `onExists` | [`OnExistsFn`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L52) | — | Callback when URL exists. See [Using Callbacks](/guides/callbacks#onexists) |

#### Returns

`Promise<string | undefined>` — The canonical URL, or `undefined` if the feed is invalid or unreachable.

#### Example

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://www.example.com/feed/?utm_source=rss')

// 'https://example.com/feed'
```
