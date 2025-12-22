# Feedcanon Package Plan

Canonical URL selection for RSS/Atom feeds.

---

## Implementation Status

### v1.0 (Current)

| Component | Status | Notes |
|-----------|--------|-------|
| `canonicalize()` | Done | Main function |
| `areEquivalent()` | Done | Compare two URLs |
| `normalizeUrl()` | Done | 14 normalization options |
| `isSimilarUrl()` | Done | URL comparison |
| `resolveUrl()` | Done | Resolve relative URLs |
| `addMissingProtocol()` | Done | Add https:// if missing |
| `resolveNonStandardFeedUrl()` | Done | feed://, rss://, pcast://, itpc:// |
| Tracking parameters | Done | 138+ params |
| Feed protocols | Done | 4 protocols |
| Fetch adapters | Done | native, axios, got, ky |
| ParserAdapter<T> | Done | Generic parser support |
| Tests | Done | Comprehensive coverage |

### Roadmap

| Feature | Priority | Status | Spec |
|---------|----------|--------|------|
| Progressive canonicalization | High | Planned | [docs/PROGRESSIVE.md](docs/PROGRESSIVE.md) |
| `existsFn` callback | High | Planned | [docs/PROGRESSIVE.md](docs/PROGRESSIVE.md) |
| Cleanliness scoring | Medium | Planned | [docs/PROGRESSIVE.md](docs/PROGRESSIVE.md) |
| FeedBurner normalization | Medium | Planned | See below |
| Domain-specific rules | Low | Planned | See below |

---

## Package Overview

**Purpose:** Select the best canonical URL for a feed by fetching, parsing, and comparing feed content.

**Core functions:**
1. `canonicalize(url, options)` - Fetch URL, extract selfUrl, choose canonical
2. `areEquivalent(url1, url2, options)` - Detect if two URLs point to same feed

**Supporting utilities:**
- `normalizeUrl()` - Normalize URL with configurable options
- `isSimilarUrl()` - Compare URLs after normalization
- `resolveUrl()` - Resolve relative URLs
- `resolveNonStandardFeedUrl()` - Convert feed://, rss://, etc.
- `addMissingProtocol()` - Add https:// if missing

**Not in scope (caller's responsibility):**
- SSRF validation (use `verifyFn` callback)
- Database deduplication
- Alias management
- Concurrency control
- Redirect stability tracking

---

## Directory Structure

```
feedcanon/
├── src/
│   ├── index.ts              # Main exports
│   ├── canonicalize.ts       # canonicalize() function
│   ├── canonicalize.test.ts
│   ├── equivalent.ts         # areEquivalent()
│   ├── equivalent.test.ts
│   ├── adapters.ts           # Fetch adapters
│   ├── adapters.test.ts
│   ├── defaults.ts           # Default options, constants
│   ├── types.ts              # Type definitions
│   ├── utils.ts              # URL utilities
│   └── utils.test.ts
├── docs/
│   ├── RESEARCH.md           # Feed reader analysis
│   └── PROGRESSIVE.md        # Progressive canonicalization spec
├── dist/
├── package.json
├── tsconfig.json
└── biome.json
```

---

## API

### `canonicalize()`

```typescript
import { canonicalize } from 'feedcanon'

const result = await canonicalize('https://example.com/feed', {
  parser: myParserAdapter,  // Required: extract selfUrl
  methods: {
    normalize: true,        // Default: true (14 options)
    redirects: true,        // Default: true
    responseHash: true,     // Default: true
    feedDataHash: false,    // Default: false (requires parsing)
    upgradeHttps: false,    // Default: false (extra fetch)
  },
  fetchFn: customFetch,
  verifyFn: isSafePublicUrl,
  hashFn: customHash,
})

// Result
result = {
  url: 'https://example.com/feed',
  reason: 'normalize' | 'redirects' | 'response_hash' | 'feed_data_hash'
        | 'upgrade_https' | 'no_self_url' | 'same_url'
        | 'verification_failed' | 'fetch_failed'
        | 'different_content' | 'fallback',
}
```

### `areEquivalent()`

```typescript
import { areEquivalent } from 'feedcanon'

const result = await areEquivalent(
  'https://example.com/feed',
  'https://example.com/rss.xml',
  { methods: { normalize: true, redirects: true, responseHash: true } }
)

// Result
result = {
  equivalent: boolean,
  method: 'normalize' | 'redirects' | 'response_hash' | 'feed_data_hash' | null,
}
```

### Parser Adapter

```typescript
type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T) => object  // For feedDataHash comparison
}

// Example with feedsmith
const feedsmithAdapter: ParserAdapter<FeedsmithResult> = {
  parse: (body) => parseFeed(body),
  getSelfUrl: (result) => {
    const { format, feed } = result
    if (format === 'atom') return feed.links?.find(l => l.rel === 'self')?.href
    if (format === 'json') return feed.feed_url
    return feed.atom?.links?.find(l => l.rel === 'self')?.href
  },
  getSignature: (result) => ({
    title: result.feed.title,
    items: result.feed.items?.slice(0, 10).map(item => ({
      guid: item.id || item.guid?.value,
      link: item.link || item.url,
    })),
  }),
}
```

---

## Comparison Methods

### For `canonicalize()`

| Method | Description | Fetch Required |
|--------|-------------|----------------|
| `normalize` | URLs match after normalization | No |
| `redirects` | selfUrl redirects to responseUrl | Yes |
| `responseHash` | Response content bytes match | Yes |
| `feedDataHash` | Parsed feed signature matches | Yes + Parse |
| `upgradeHttps` | HTTPS version works and matches | Yes |

### For `areEquivalent()`

| Method | Description | Fetch Required |
|--------|-------------|----------------|
| `normalize` | URLs match after normalization | No |
| `redirects` | One URL redirects to the other | Yes |
| `responseHash` | Response content bytes match | Yes |
| `feedDataHash` | Parsed feed signature matches | Yes + Parse |

---

## Normalization Options

| Option | Example | Default |
|--------|---------|---------|
| `protocol` | `http://` ↔ `https://` | true |
| `authentication` | `user:pass@` → strip | true |
| `www` | `www.example.com` ↔ `example.com` | true |
| `port` | `:443`, `:80` → strip | true |
| `trailingSlash` | `/feed/` ↔ `/feed` | true |
| `singleSlash` | `example.com/` ↔ `example.com` | true |
| `slashes` | `//path` → `/path` | true |
| `hash` | `#section` → strip | true |
| `textFragment` | `#:~:text=` → strip | true |
| `queryOrder` | `?b=2&a=1` → `?a=1&b=2` | true |
| `strippedParams` | `?utm_source=x` → strip | 138 params |
| `emptyQuery` | `/feed?` → `/feed` | true |
| `encoding` | `%2F` → `/` | true |
| `case` | hostname lowercase | true |
| `unicode` | NFC normalization | true |
| `punycode` | IDNA/Punycode | true |

---

## Exports

```typescript
// Main entry point
import {
  canonicalize,
  areEquivalent,
  normalizeUrl,
  isSimilarUrl,
  resolveUrl,
  addMissingProtocol,
  resolveNonStandardFeedUrl,
  type ParserAdapter,
  type CanonicalizeOptions,
  type CanonicalizeResult,
  type EquivalentOptions,
  type EquivalentResult,
  type NormalizeOptions,
  type FetchFn,
  type VerifyFn,
  type HashFn,
} from 'feedcanon'

// Defaults
import {
  defaultStrippedParams,
  defaultFeedProtocols,
  defaultNormalizeOptions,
  defaultCanonicalizeMethods,
  defaultEquivalentMethods,
  defaultFetchFn,
  defaultVerifyFn,
  defaultHashFn,
} from 'feedcanon/defaults'

// Fetch adapters
import {
  createNativeFetchAdapter,
  createAxiosAdapter,
  createGotAdapter,
  createKyAdapter,
} from 'feedcanon/adapters'
```

---

## Future: FeedBurner Normalization

Add special handling for FeedBurner URLs (inspired by CommaFeed):

```typescript
// Normalize FeedBurner domains
'feedproxy.google.com' → 'feeds.feedburner.com'
'feeds2.feedburner.com' → 'feeds.feedburner.com'

// Strip all query params from FeedBurner URLs
'feeds.feedburner.com/feed?format=xml' → 'feeds.feedburner.com/feed'
```

---

## Future: Domain-Specific Rules

For services that need special handling:

```typescript
domainRules?: {
  [domain: string]: {
    stripParams?: string[]      // Additional params to strip
    stripAllParams?: boolean    // Strip ALL query params
  }
}

// Example
domainRules: {
  'feeds.feedburner.com': { stripAllParams: true },
  'medium.com': { stripParams: ['source', 'sk'] },
}
```

---

## Design Decisions

### Zero Dependencies

All URL normalization uses Node.js built-in `URL` class. No external dependencies for core functionality.

### Parser Agnostic

Users bring their own parser via `ParserAdapter<T>`. No default parser shipped.

### SSRF via Callback

SSRF protection is caller's responsibility via `verifyFn`. Keeps feedcanon focused and portable.

### Hash Function Flexibility

Accept either pre-computed `hash` or compute from `content` using `hashFn`. Default: MD5 via Node.js crypto.

---

_Last updated: December 2024_
