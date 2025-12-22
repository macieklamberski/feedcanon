# Feedcanon

[![codecov](https://codecov.io/gh/macieklamberski/feedcanon/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/feedcanon)
[![npm version](https://img.shields.io/npm/v/feedcanon.svg)](https://www.npmjs.com/package/feedcanon)
[![license](https://img.shields.io/npm/l/feedcanon.svg)](https://github.com/macieklamberski/feedcanon/blob/main/LICENSE)

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest, most reliable form.

Many URLs can point to the same feed—varying by protocol, www prefixes, trailing slashes, order of params, or domain aliases. Feedcanon compares actual feed content, considers the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one. Perfect for feed readers that need consistent, deduplicated subscriptions.

---

## How It Works

- Read the feed's declared self URL (`atom:link rel="self"`) and validate it serves identical content.
- Generate URL variants from cleanest to least clean, testing each until one works.
- Verify URLs serve the same feed using exact body match, then signature-based matching.
- Attempt to upgrade HTTP URLs to HTTPS when both serve identical content.
- Normalize platform-specific domains (e.g., FeedBurner aliases like `feedproxy.google.com` → `feeds.feedburner.com`).

## Quick Start

### Installation

```bash
npm install feedcanon
```

### Basic Usage

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://www.example.com/feed/?utm_source=twitter')

// 'https://example.com/feed'
```

### With Options

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/feed', {
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
