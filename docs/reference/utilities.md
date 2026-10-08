---
title: "Reference: Utilities"
---

# Utilities

Low-level utility functions for URL resolution and normalization. Used internally by `findCanonical` but exported for direct use.

::: warning Deprecated
These functions and the `NormalizeOptions` type now live in [trousse](https://github.com/macieklamberski/trousse). Import them from there. The trousse `normalizeUrl` takes no default options, so pass `defaultNormalizeOptions` from `feedcanon/defaults` to keep the current behavior.
:::

```typescript
import {
  normalizeUrl,
  resolveUrl,
  resolveFeedProtocol,
  fixMalformedProtocol,
  addMissingProtocol,
  upgradeProtocol,
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
| `stripProtocol` | `true` | Remove scheme from URL |
| `stripAuthentication` | `false` | Remove `user:pass@` |
| `stripWww` | `true` | Remove `www.` prefix |
| `stripTrailingSlash` | `true` | Remove trailing `/` from paths |
| `stripRootSlash` | `true` | Remove `/` from root paths |
| `collapseSlashes` | `true` | Collapse multiple slashes `///` → `/` |
| `stripHash` | `true` | Remove `#fragment` |
| `sortQueryParams` | `true` | Sort query params alphabetically |
| `stripQueryParams` | — | Array of params to strip |
| `stripQuery` | `false` | Remove entire query string |
| `stripEmptyQuery` | `true` | Remove empty `?` |
| `lowercaseQuery` | `false` | Lowercase query param names and values |
| `normalizeEncoding` | `true` | Normalize `%XX` encoding |
| `normalizeUnicode` | `true` | NFC normalization for Unicode |

The defaults apply only when `options` is omitted. Passing an options object replaces the whole default set, so any option you leave out is off.

#### Returns

`string`: The normalized URL, or the original URL if parsing fails.

#### Example

```typescript
import { normalizeUrl } from 'feedcanon'

normalizeUrl('https://WWW.EXAMPLE.COM/feed/', {
  stripWww: true,
  stripTrailingSlash: true,
})
// 'https://example.com/feed'

normalizeUrl('https://www.example.com/feed/?b=2&a=1#top')
// 'example.com/feed?a=1&b=2'
```

---

### `resolveUrl()`

Resolves a URL by converting feed schemes, resolving relative URLs, and ensuring it's a valid HTTP(S) URL.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to resolve |
| `base` | `string` | Optional base URL for relative resolution |

#### Returns

`string | undefined`: The resolved HTTP(S) URL, or `undefined` if invalid.

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

Converts feed-related schemes to HTTP(S).

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to convert |
| `protocol` | `'http' \| 'https'` | `'https'` | Target scheme |

#### Returns

`string`: The URL with converted scheme, or unchanged if not a feed scheme.

#### Supported Schemes

`feed://`, `feed:https://`, `feed:http://`, `rss://`, `podcast://`, `podcasts://`, `pcast://`, `itpc://`, `itms://`, `itms-pcast://`, `itms-pcasts://`, `itms-podcast://`, `itms-podcasts://`

#### Example

```typescript
import { resolveFeedProtocol } from 'feedcanon'

resolveFeedProtocol('feed://example.com/rss.xml')
// 'https://example.com/rss.xml'

resolveFeedProtocol('itpc://example.com/podcast.xml')
// 'https://example.com/podcast.xml'
```

---

### `fixMalformedProtocol()`

Fixes common malformations in HTTP(S) schemes, such as typos, wrong separators and doubled schemes.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | The URL to fix |

#### Returns

`string`: The URL with the scheme fixed, or unchanged if the scheme is valid or not HTTP-like.

#### Example

```typescript
import { fixMalformedProtocol } from 'feedcanon'

fixMalformedProtocol('http:/example.com/feed')
// 'http://example.com/feed'

fixMalformedProtocol('htp://example.com/feed')
// 'http://example.com/feed'

fixMalformedProtocol('http:http://example.com/feed')
// 'http://example.com/feed'

fixMalformedProtocol('http(s)://example.com/feed')
// 'https://example.com/feed'
```

---

### `addMissingProtocol()`

Adds a scheme to URLs missing one.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to process |
| `protocol` | `'http' \| 'https'` | `'https'` | Scheme to add |

#### Returns

`string`: The URL with scheme added, or unchanged if not applicable.

#### Example

```typescript
import { addMissingProtocol } from 'feedcanon'

addMissingProtocol('//example.com/feed')
// 'https://example.com/feed'

addMissingProtocol('example.com/feed')
// 'https://example.com/feed'
```

---

### `upgradeProtocol()`

Swaps an existing HTTP(S) scheme on a URL. Unlike `addMissingProtocol`, which only acts when the scheme is absent, this rewrites the scheme when one is already present.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to process |
| `protocol` | `'http' \| 'https'` | `'https'` | Target scheme |

#### Returns

`string`: The URL with the scheme swapped, or unchanged if no matching HTTP(S) scheme is present.

#### Notes

- Case-insensitive on the matched scheme (`HTTP://` is upgraded).
- Only the leading scheme is touched; an `http://` substring later in the path or query is left alone.
- Scheme-relative URLs (`//host`) and non-HTTP schemes (`mailto:`, `data:`, `ftp://`, `feed://`) are left unchanged.

#### Example

```typescript
import { upgradeProtocol } from 'feedcanon'

upgradeProtocol('http://example.com/feed')
// 'https://example.com/feed'

upgradeProtocol('https://example.com/feed', 'http')
// 'http://example.com/feed'

upgradeProtocol('//example.com/feed')
// '//example.com/feed' (unchanged)
```
