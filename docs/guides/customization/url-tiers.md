---
title: "Customization: URL Tiers"
---

# Customize URL Tiers

Feedcanon applies URL normalization tiers to generate candidates, ordered from cleanest to least clean. The first candidate serving the same content wins.

Default tiers:

1. **Tier 1**: Strip query, www, and trailing slash
2. **Tier 2**: Strip www and trailing slash, keep query
3. **Tier 3**: Keep www, strip trailing slash, keep query
4. **Tier 4**: Keep www and trailing slash, keep query

::: info
Tracking parameters are stripped separately via the `stripQueryParams` option in `FindCanonicalOptions`, not per-tier. This ensures consistent param stripping across all tiers.
:::

## Normalization Options

Each tier accepts all `NormalizeOptions` except `stripQueryParams`, which is handled at the top level. A tier is not merged with any defaults: an option you leave out is off for that tier.

| Option | Description |
|--------|-------------|
| `stripProtocol` | Remove protocol (not recommended for feed URLs) |
| `stripAuthentication` | Remove `user:pass@` |
| `stripWww` | Remove `www.` prefix |
| `stripTrailingSlash` | Remove trailing `/` from paths |
| `stripRootSlash` | Remove `/` from root paths |
| `collapseSlashes` | `///` → `/` |
| `stripHash` | Remove `#fragment` |
| `sortQueryParams` | Sort params alphabetically |
| `stripQuery` | Remove entire query string |
| `stripEmptyQuery` | Remove empty `?` |
| `lowercaseQuery` | Lowercase query param names and values |
| `normalizeEncoding` | Normalize `%XX` encoding |
| `normalizeUnicode` | NFC normalization |

## Examples

### Minimal Tiers

Use a single tier with minimal normalization:

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  tiers: [{}], // No URL transformations, only query param stripping
})
```

### Aggressive Tiers

Clean up the host and path as much as possible with a single tier, while keeping the query string:

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  tiers: [
    {
      stripWww: true,
      stripTrailingSlash: true,
      stripRootSlash: true,
      collapseSlashes: true,
      stripHash: true,
      sortQueryParams: true,
      stripEmptyQuery: true,
      normalizeEncoding: true,
      normalizeUnicode: true,
    },
  ],
})
```

### Custom Stripped Params

Add your own tracking parameters (at the top level, not per-tier):

```typescript
import { findCanonical } from 'feedcanon'
import { defaultStrippedParams } from 'feedcanon/defaults'

const url = await findCanonical('https://example.com/feed', {
  stripQueryParams: [
    ...defaultStrippedParams,
    'my_tracking_param',
    'internal_ref',
  ],
  tiers: [
    { stripWww: true, stripTrailingSlash: true },
    { stripTrailingSlash: true },
  ],
})
```

### Preserve Query Params

Keep all query parameters (no stripping):

```typescript
const url = await findCanonical('https://example.com/feed', {
  stripQueryParams: [], // Keep all params
  tiers: [
    { stripWww: true, stripTrailingSlash: true },
  ],
})
```

## Default Stripped Parameters

Feedcanon strips 100+ tracking parameters by default. See [`defaultStrippedParams`](https://github.com/macieklamberski/feedcanon/blob/1.x/src/defaults.ts) for the complete list.
