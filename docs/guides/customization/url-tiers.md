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
In addition to the structural tiers, you can plug extra cleaning into the `cleanUrlFn` option in `FindCanonicalOptions`: strip tracking params, unwrap redirect wrappers, or apply any custom rewrite. It runs once before candidate generation, so the cleanup stays consistent across all tiers. The [urlpurify](https://github.com/macieklamberski/urlpurify) package provides ready-made functions for this.
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

### Strip Tracking Params

Clean tracking params before candidate generation (at the top level, not per-tier):

```typescript
import { findCanonical } from 'feedcanon'
import { stripTrackingParams } from 'urlpurify'

const url = await findCanonical('https://example.com/feed', {
  cleanUrlFn: stripTrackingParams,
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
  tiers: [
    { stripWww: true, stripTrailingSlash: true },
  ],
})
```

