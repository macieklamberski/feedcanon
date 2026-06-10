---
title: "Customization: URL Tiers"
---

# Customize URL Tiers

Feedcanon applies URL normalization tiers to generate candidates, ordered from cleanest to least clean. The first candidate serving the same content wins.

Default tiers:

1. **Tier 1** — Strip query, www, and trailing slash
2. **Tier 2** — Strip www and trailing slash, keep query
3. **Tier 3** — Keep www, strip trailing slash, keep query
4. **Tier 4** — Keep www and trailing slash, keep query

::: info
Tracking parameters are stripped separately via the `stripQueryParams` option in `FindCanonicalOptions`, not per-tier. This ensures consistent param stripping across all tiers.
:::

## Normalization Options

Each tier accepts all `NormalizeOptions` except `stripQueryParams`:

| Option | Default | Description |
|--------|---------|-------------|
| `stripProtocol` | `false` | Remove protocol (not recommended for feed URLs) |
| `stripAuthentication` | `false` | Remove `user:pass@` |
| `stripWww` | `true` | Remove `www.` prefix |
| `stripTrailingSlash` | `true` | Remove trailing `/` from paths |
| `stripRootSlash` | `true` | Remove `/` from root paths |
| `collapseSlashes` | `true` | `///` → `/` |
| `stripHash` | `true` | Remove `#fragment` |
| `sortQueryParams` | `true` | Sort params alphabetically |
| ~~`stripQueryParams`~~ | ~~—~~ | ~~Handled at top level, not per-tier~~ |
| `stripQuery` | `false` | Remove entire query string |
| `stripEmptyQuery` | `true` | Remove empty `?` |
| `normalizeEncoding` | `true` | Normalize `%XX` encoding |
| `normalizeUnicode` | `true` | NFC normalization |

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

Strip everything possible with a single tier:

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
import { defaultTrackingParams } from 'urlpurify'

const url = await findCanonical('https://example.com/feed', {
  stripQueryParams: [
    ...defaultTrackingParams,
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

Feedcanon strips 150+ tracking parameters by default, sourced from the [urlpurify](https://github.com/macieklamberski/urlpurify) package. See [`defaultTrackingParams`](https://github.com/macieklamberski/urlpurify/blob/main/src/params.ts) for the complete list.
