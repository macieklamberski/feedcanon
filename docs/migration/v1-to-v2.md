---
title: Migrating from 1.x to 2.x
---

# Migrating from 1.x to 2.x

This guide covers all breaking changes when upgrading from Feedcanon 1.x to 2.x. Each breaking change is detailed with specific upgrade steps and examples.

> [!IMPORTANT]
> Version 2.x no longer strips tracking parameters on its own. The built-in list and the `stripQueryParams` option are gone. Pass a `cleanUrlFn` instead, for example `stripTrackingParams` from [urlpurify](https://github.com/macieklamberski/urlpurify).

## Installation

Feedsmith is now a peer dependency, so install it next to Feedcanon:

```bash
npm install feedcanon@latest feedsmith@3
```

If you want to keep stripping tracking parameters, also install urlpurify:

```bash
npm install urlpurify
```

## Migration Checklist

Use this checklist to ensure a complete migration:

- Replace `require('feedcanon')` with `import` (the package is ESM-only)
- Install `feedsmith@3` as a direct dependency
- Replace the `stripQueryParams` option of `findCanonical` with `cleanUrlFn`
- Add `cleanUrlFn` if you relied on the default tracking parameter stripping
- Remove imports of `defaultStrippedParams`
- Pass `stripQueryParams` explicitly when calling `normalizeUrl` without options
- Update code that reads the parsed feed in `onMatch` or wraps `defaultParser` to the Feedsmith 3 types
- Check stored canonical URLs that contain query strings

## Breaking Changes

### ESM-Only Package

The CommonJS build has been removed. The package now ships only ES modules, for both the `feedcanon` and `feedcanon/defaults` entry points.

#### Before (1.x)
```typescript
const { findCanonical } = require('feedcanon')
```

#### After (2.x)
```typescript
import { findCanonical } from 'feedcanon'
```

In a CommonJS module, load it with a dynamic import:

```typescript
const { findCanonical } = await import('feedcanon')
```

#### Migration Steps
1. Replace `require('feedcanon')` and `require('feedcanon/defaults')` with `import`
2. In CommonJS code that cannot switch to ES modules, use `await import('feedcanon')`. Node.js 20.19, 22.12 and later can also load ES modules with `require()`

### Feedsmith Is a Peer Dependency

Feedcanon 1.x installed Feedsmith 2 as its own dependency. In 2.x, Feedsmith is a peer dependency and must be version 3. Your project installs it, so Feedcanon and your code share one copy.

#### Before (1.x)
```bash
npm install feedcanon
```

#### After (2.x)
```bash
npm install feedcanon feedsmith@3
```

#### Migration Steps
1. Add `feedsmith` at `^3.0.0` to your `dependencies`
2. If your own code uses Feedsmith 2, follow the [Feedsmith 2.x to 3.x migration guide](https://feedsmith.dev/migration/v2-to-v3)

### `stripQueryParams` Option Replaced by `cleanUrlFn`

In 1.x, `findCanonical` removed over 150 tracking parameters by default, and the `stripQueryParams` option replaced that list. In 2.x, both are gone. Feedcanon removes no query parameters unless you pass a `cleanUrlFn`. It receives a URL and returns the cleaned URL. Feedcanon applies it to the initial response URL, the self URL and every candidate URL before comparing them.

`cleanUrlFn` is not limited to tracking parameters. It can also unwrap redirect links or apply any other rewrite. The `stripTrackingParams` and `cleanUrl` functions from urlpurify fit it directly.

#### Before (1.x)
```typescript
import { findCanonical } from 'feedcanon'
import { defaultStrippedParams } from 'feedcanon/defaults'

// Default tracking params stripped
const url = await findCanonical('https://example.com/feed')

// Custom list
const url = await findCanonical('https://example.com/feed', {
  stripQueryParams: [...defaultStrippedParams, 'my_tracking_param'],
})

// Keep all params
const url = await findCanonical('https://example.com/feed', {
  stripQueryParams: [],
})
```

#### After (2.x)
```typescript
import { findCanonical } from 'feedcanon'
import { defaultTrackingParams, stripTrackingParams } from 'urlpurify'

// Default tracking params stripped
const url = await findCanonical('https://example.com/feed', {
  cleanUrlFn: stripTrackingParams,
})

// Custom list
const url = await findCanonical('https://example.com/feed', {
  cleanUrlFn: (url) => {
    return stripTrackingParams(url, [...defaultTrackingParams, 'my_tracking_param'])
  },
})

// Keep all params
const url = await findCanonical('https://example.com/feed')
```

#### Migration Steps
1. If you passed no `stripQueryParams`, add `cleanUrlFn: stripTrackingParams` to keep tracking parameters out of canonical URLs
2. If you passed a custom list, move it into a `cleanUrlFn` that calls `stripTrackingParams(url, yourList)`
3. If you passed `stripQueryParams: []`, remove the option
4. The urlpurify list is not identical to the 1.x list. It also matches families of parameters with patterns such as `/^utm_[a-z0-9_-]+$/`. Pass your own list if you need exact 1.x results

### `defaultStrippedParams` Removed

The `defaultStrippedParams` export has been removed from both `feedcanon` and `feedcanon/defaults`. Use `defaultTrackingParams` from urlpurify instead.

#### Before (1.x)
```typescript
import { defaultStrippedParams } from 'feedcanon'
```

#### After (2.x)
```typescript
import { defaultTrackingParams } from 'urlpurify'
```

#### Migration Steps
1. Replace `defaultStrippedParams` imports with `defaultTrackingParams` from urlpurify
2. `defaultTrackingParams` holds both strings and regular expressions. If you need strings only, use `trackingParamsLiterals`

### `normalizeUrl` No Longer Strips Tracking Parameters by Default

When called without options, `normalizeUrl` uses `defaultNormalizeOptions`. In 1.x, those options included the tracking parameter list. In 2.x, they do not, so tracking parameters stay in the URL. The `stripQueryParams` option of `normalizeUrl` itself still works.

#### Before (1.x)
```typescript
import { normalizeUrl } from 'feedcanon'

normalizeUrl('https://www.example.com/feed/?utm_source=x&b=2&a=1')
// 'example.com/feed?a=1&b=2'
```

#### After (2.x)
```typescript
import { normalizeUrl } from 'feedcanon'
import { stripTrackingParams } from 'urlpurify'

normalizeUrl('https://www.example.com/feed/?utm_source=x&b=2&a=1')
// 'example.com/feed?a=1&b=2&utm_source=x'

normalizeUrl(stripTrackingParams('https://www.example.com/feed/?utm_source=x&b=2&a=1'))
// 'example.com/feed?a=1&b=2'
```

#### Migration Steps
1. Where you call `normalizeUrl` without options, clean the URL first with `stripTrackingParams`, or pass `stripQueryParams` with your own list
2. If you spread `defaultNormalizeOptions` from `feedcanon/defaults`, note it no longer contains `stripQueryParams`

### Parsed Feed Types Follow Feedsmith 3

The default parser now uses Feedsmith 3, so `DefaultParserResult` has the Feedsmith 3 shape. This affects the `feed` passed to `onMatch` and any custom parser that wraps `defaultParser`. For example, Atom text fields such as `title` are now objects with a `value` property.

#### Before (1.x)
```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  onMatch: ({ url, feed }) => {
    if (feed.format === 'atom') {
      console.log(url, feed.feed.title) // string
    }
  },
})
```

#### After (2.x)
```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  onMatch: ({ url, feed }) => {
    if (feed.format === 'atom') {
      console.log(url, feed.feed.title?.value) // string
    }
  },
})
```

#### Migration Steps
1. Review code that reads `feed` in `onMatch` or uses `DefaultParserResult`
2. Apply the changes from the [Feedsmith 2.x to 3.x migration guide](https://feedsmith.dev/migration/v2-to-v3) to that code

### Query Strings Keep Their Raw Encoding

`normalizeUrl` now edits the query as raw `key=value` pairs. In 1.x, stripping, lowercasing or sorting parameters re-encoded the whole query as form data. A query like `?/feeds/atom10.xml` came back as `?%2Ffeeds%2Fatom10.xml=` and no longer pointed at the feed. In 2.x, the query keeps its original encoding, and empty pairs are dropped when sorting.

As a result, some canonical URLs returned by 2.x differ from the ones 1.x returned for the same feed.

#### Before (1.x)
```typescript
import { normalizeUrl } from 'feedcanon'

normalizeUrl('https://example.com/?/feeds/atom10.xml', { sortQueryParams: true })
// 'https://example.com/?%2Ffeeds%2Fatom10.xml='
```

#### After (2.x)
```typescript
import { normalizeUrl } from 'feedcanon'

normalizeUrl('https://example.com/?/feeds/atom10.xml', { sortQueryParams: true })
// 'https://example.com/?/feeds/atom10.xml'
```

#### Migration Steps
1. If you store canonical URLs and look them up in `existsFn`, check stored URLs that contain query strings
2. Re-run `findCanonical` for affected feeds, or match both forms during the transition

## New Features

### Custom URL Cleaning

The `cleanUrlFn` option accepts any function that takes a URL and returns a URL. Use it to unwrap redirect links as well as strip tracking parameters:

```typescript
import { findCanonical } from 'feedcanon'
import { cleanUrl } from 'urlpurify'

const url = await findCanonical('https://example.com/feed', {
  cleanUrlFn: cleanUrl,
})
```

See [URL Tiers](/guides/customization/url-tiers#strip-tracking-params) for more details.

### More Feed Protocols

`resolveFeedProtocol` and `findCanonical` now also resolve `podcasts://`, `itms://`, `itms-pcast://`, `itms-pcasts://`, `itms-podcast://` and `itms-podcasts://` URLs to HTTP(S).
