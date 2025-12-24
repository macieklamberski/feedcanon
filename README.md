# Feedcanon

[![codecov](https://codecov.io/gh/macieklamberski/feedcanon/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/feedcanon)
[![npm version](https://img.shields.io/npm/v/feedcanon.svg)](https://www.npmjs.com/package/feedcanon)
[![license](https://img.shields.io/npm/l/feedcanon.svg)](https://github.com/macieklamberski/feedcanon/blob/main/LICENSE)

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.

Many URLs can point to the same feed, varying by protocol, www prefixes, trailing slashes, order of params, or domain aliases. Feedcanon compares actual feed content, respects the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one. Perfect for feed readers that need consistent, deduplicated subscriptions.

**[Read full docs ↗](https://feedcanon.dev)**
&nbsp;&nbsp;·&nbsp;&nbsp;
[Quick Start](#quick-start)

---

## Example

The 9 URLs below all work and return identical content. None redirect to each other, normally making each appear unique. Feedcanon compares content, normalizes URLs and resolves them to a single URL.

```
http://feeds.kottke.org/main ───────────┐
http://feeds.kottke.org/main/ ──────────┤
https://feeds.kottke.org/main ──────────┤
https://feeds.kottke.org/main/ ─────────┤
https://feeds.kottke.org///main/ ───────┼───→ https://feeds.kottke.org/main
http://feeds.feedburner.com/kottke ─────┤
http://feeds.feedburner.com/kottke/ ────┤
https://feeds.feedburner.com/kottke ────┤
https://feeds.feedburner.com/kottke/ ───┘
```

## Features

### How It Works

1. Fetch the input URL and parse the feed to establish reference content.
2. Extract the feed's declared self URL (`atom:link rel="self"`) and validate it serves identical content.
3. Generate URL variants ordered from cleanest to least clean.
4. Test variants in order—the first one serving identical content wins.
5. Upgrade HTTP to HTTPS if both serve identical content.

### URL Transforms

- Strip www prefix — `www.example.com` → `example.com`
- Strip trailing slashes — `/feed/` → `/feed`
- Strip tracking params — remove 100+ known tracking parameters (UTM, Facebook, Google Ads, etc.)
- Collapse slashes — `//feed///rss` → `/feed/rss`
- Strip fragments — remove `#hash` and text fragments
- Sort query params — alphabetically sort remaining query parameters
- Normalize encoding — standardize percent-encoded characters
- Unicode support — NFC for consistent representation
- Punycode support — convert internationalized domain names

### Customization

- **Custom fetch** — use your own HTTP client (Axios, Got, Ky, etc.)
- **Custom parser** — bring your own feed parser with the `ParserAdapter` interface.
- **Custom tiers** — define your own URL variant priority order.
- **Custom platforms** — add handlers to normalize domain aliases (like FeedBurner).
- **Database lookup** — use `existsFn` to check if a URL already exists in your database.
- **Progress callbacks** — monitor the process with `onFetch`, `onMatch`, and `onExists` callbacks.
- **Type-safe** — full TypeScript support with exported types.

## Quick Start

Basic installation and common usage patterns. For a full overview, visit the [documentation website](https://feedcanon.dev).

### Installation

```bash
npm install feedcanon
```

### Basic Usage

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('http://www.example.com/feed/?utm_source=twitter')

// 'https://example.com/feed' or undefined if feed is invalid or unreachable
```

### With Callbacks

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  onFetch: ({ url, response }) => {
    console.log('Fetched:', url, response.status)
  },
  onMatch: ({ url, feed }) => {
    console.log('Found matching URL:', url)
  },
})
```

### Custom Fetch

```typescript
import { findCanonical } from 'feedcanon'
import axios from 'axios'

const url = await findCanonical('https://example.com/feed', {
  fetchFn: async (url) => {
    const response = await axios.get(url)
    return {
      status: response.status,
      url: response.request.res.responseUrl,
      body: response.data,
      headers: new Headers(response.headers),
    }
  },
})
```

### Database Integration

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
  existsFn: async (url) => {
    // Return data if URL exists in your database, undefined otherwise.
    return await db.feeds.findByUrl(url)
  },
  onExists: ({ url, data }) => {
    console.log('URL already exists:', url)
  },
})
```
