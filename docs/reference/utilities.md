---
prev: API Reference › findCanonical
---

# Utilities

Low-level utility functions for URL resolution and normalization. Used internally by `findCanonical` but exported for direct use.

```typescript
import {
  normalizeUrl,
  resolveUrl,
  resolveFeedProtocol,
  addMissingProtocol,
} from 'feedcanon'
```

### `normalizeUrl()`

Normalizes a URL by applying transformation options.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to normalize |
| `options` | `object` | Normalization options |

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `stripProtocol` | `false` | Remove protocol from URL |
| `stripAuthentication` | `false` | Remove `user:pass@` |
| `stripWww` | `true` | Remove `www.` prefix |
| `stripTrailingSlash` | `true` | Remove trailing `/` from paths |
| `stripRootSlash` | `true` | Remove `/` from root paths |
| `collapseSlashes` | `true` | Collapse multiple slashes `///` → `/` |
| `stripHash` | `true` | Remove `#fragment` |
| `sortQueryParams` | `true` | Sort query params alphabetically |
| `stripQueryParams` | `string[]` | Array of params to strip |
| `stripEmptyQuery` | `true` | Remove empty `?` |
| `normalizeEncoding` | `true` | Normalize `%XX` encoding |
| `normalizeUnicode` | `true` | NFC normalization for Unicode |
| `convertToPunycode` | `true` | Convert IDN to Punycode |

#### Returns

`string` — The normalized URL, or the original URL if parsing fails.

#### Example

```typescript
import { normalizeUrl } from 'feedcanon'

normalizeUrl('https://WWW.EXAMPLE.COM/feed/', {
  stripWww: true,
  stripTrailingSlash: true,
})
// 'https://example.com/feed'
```

---

### `resolveUrl()`

Resolves a URL by converting feed protocols, resolving relative URLs, and ensuring it's a valid HTTP(S) URL.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to resolve |
| `base` | `string` | Optional base URL for relative resolution |

#### Returns

`string | undefined` — The resolved HTTP(S) URL, or `undefined` if invalid.

#### Example

```typescript
import { resolveUrl } from 'feedcanon'

resolveUrl('feed://example.com/rss.xml')
// 'https://example.com/rss.xml'

resolveUrl('/feed.xml', 'https://example.com/blog/')
// 'https://example.com/feed.xml'
```

---

### `resolveFeedProtocol()`

Converts feed-related protocols to HTTP(S).

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to convert |
| `protocol` | `'http' \| 'https'` | `'https'` | Target protocol |

#### Returns

`string` — The URL with converted protocol, or unchanged if not a feed protocol.

#### Supported Protocols

`feed://`, `feed:https://`, `feed:http://`, `rss://`, `podcast://`, `pcast://`, `itpc://`

#### Example

```typescript
import { resolveFeedProtocol } from 'feedcanon'

resolveFeedProtocol('feed://example.com/rss.xml')
// 'https://example.com/rss.xml'

resolveFeedProtocol('itpc://example.com/podcast.xml')
// 'https://example.com/podcast.xml'
```

---

### `addMissingProtocol()`

Adds protocol to URLs missing a scheme.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to process |
| `protocol` | `'http' \| 'https'` | `'https'` | Protocol to add |

#### Returns

`string` — The URL with protocol added, or unchanged if not applicable.

#### Example

```typescript
import { addMissingProtocol } from 'feedcanon'

addMissingProtocol('//example.com/feed')
// 'https://example.com/feed'

addMissingProtocol('example.com/feed')
// 'https://example.com/feed'
```
